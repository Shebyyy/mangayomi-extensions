const mangayomiSources = [{
    "name": "NetflixMirror",
    "lang": "all",
    "baseUrl": "https://iosmirror.cc",
    "apiUrl": "https://pcmirror.cc",
    "iconUrl": "https://raw.githubusercontent.com/kodjodevf/mangayomi-extensions/main/javascript/icon/all.netflixmirror.png",
    "typeSource": "single",
    "isManga": false,
    "itemType": 1,
    "version": "0.0.10",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "anime/src/all/netflixmirror.js"
}];

class DefaultExtension extends MProvider {

    getTVApi() {
        return "https://pcmirror.cc"
    }

    getPreference(key) {
        const preferences = new SharedPreferences();
        return preferences.get(key);
    }

    getPoster(id) {
        return `https://imgcdn.media/poster/v/${id}.jpg`
    }

    async getCookie() {
        const preferences = new SharedPreferences();
        let cookie = preferences.getString("cookie", "");
        var cookie_ts = parseInt(preferences.getString("cookie_ts", "0"));
        var now_ts = parseInt(new Date().getTime() / 1000);

        // Cookie lasts for 24hrs but still checking for 12hrs
        if (now_ts - cookie_ts > 60 * 60 * 12) {
            const check = await new Client().get(`${this.source.baseUrl}/home`, { "cookie": cookie });
            const hDocBody = new Document(check.body).selectFirst("body")

            const addhash = hDocBody.attr("data-addhash");
            const data_time = hDocBody.attr("data-time");

            var res = await new Client().post(`${this.getTVApi()}/tv/p.php`, { "cookie": "" }, { "hash": addhash });
            cookie = res.headers["set-cookie"];
            preferences.setString("cookie", cookie);
            preferences.setString("cookie_ts", data_time);
        }


        return cookie;
    }
    async request(url, cookie, tvApi = false) {
        cookie = cookie ?? await this.getCookie();
        var api = tvApi ? this.getTVApi() : this.source.baseUrl;
        return (await new Client().get(api + url, { "cookie": cookie })).body;
    }
    async getPopular(page) {
        return await this.getPages(await this.request("/home"), ".tray-container, #top10")
    }
    async getLatestUpdates(page) {
        return await this.getPages(await this.request("/home"), ".inner-mob-tray-container")
    }
    async getPages(body, selector) {
        var name_pref = this.getPreference("netmirror_pref_display_name");
        const elements = new Document(body).select(selector);
        const cookie = await this.getCookie();
        const list = [];
        for (const element of elements) {
            const linkElement = element.selectFirst("article, .top10-post");
            const id = linkElement.selectFirst("a").attr("data-post");
            if (id.length > 0) {
                const imageUrl = linkElement.selectFirst(".card-img-container img, .top10-img img").attr("data-src");
                var name = name_pref ? JSON.parse(await this.request(`/post.php?id=${id}`, cookie)).title : `\n${id}`

                list.push({ name, imageUrl, link: id });
            }
        }
        return {
            list: list,
            hasNextPage: false
        }
    }
    async search(query, page, filters) {
        const data = JSON.parse(await this.request(`/search.php?s=${query}`));
        const list = [];
        data.searchResult.map(async (res) => {
            const id = res.id;
            list.push({ name: res.t, imageUrl: this.getPoster(id), link: id });
        })

        return {
            list: list,
            hasNextPage: false
        }
    }
    async getDetail(url) {
        const cookie = await this.getCookie();
        const data = JSON.parse(await this.request(`/post.php?id=${url}`, cookie));
        const name = data.title;
        const genre = [data.ua, ...(data.genre || '').split(',').map(g => g.trim())];
        const description = data.desc;
        let episodes = [];
        if (data.episodes[0] === null) {
            episodes.push({ name, url: JSON.stringify({ id: url, name }) });
        } else {
            episodes = data.episodes.map(ep => ({
                name: `${ep.s.replace('S', 'Season ')} ${ep.ep.replace('E', 'Episode ')} : ${ep.t}`,
                url: JSON.stringify({ id: ep.id, name })
            }));
        }
        if (data.nextPageShow === 1) {
            const eps = await this.getEpisodes(name, url, data.nextPageSeason, 2, cookie);
            episodes.push(...eps);
        }
        episodes.reverse();
        if (data.season && data.season.length > 1) {
            let newEpisodes = [];
            const seasonsToProcess = data.season.slice(0, -1);
            await Promise.all(seasonsToProcess.map(async (season) => {
                const eps = await this.getEpisodes(name, url, season.id, 1, cookie);
                newEpisodes.push(...eps);
            }));
            newEpisodes.reverse();
            episodes.push(...newEpisodes);

        }

        return {
            name, imageUrl: this.getPoster(url), description, status: 1, genre, episodes
        };
    }
    async getEpisodes(name, eid, sid, page, cookie) {
        const episodes = [];
        let pg = page;
        while (true) {
            try {
                const data = JSON.parse(await this.request(`/episodes.php?s=${sid}&series=${eid}&page=${pg}`, cookie));

                data.episodes?.forEach(ep => {
                    episodes.push({
                        name: `${ep.s.replace('S', 'Season ')} ${ep.ep.replace('E', 'Episode ')} : ${ep.t}`,
                        url: JSON.stringify({ id: ep.id, name })
                    });
                });

                if (data.nextPageShow === 0) break;
                pg++;
            } catch (_) {
                break;
            }
        }

        return episodes;
    }

    // Sorts streams based on user preference.
    async sortStreams(streams) {
        var sortedStreams = [];

        var copyStreams = streams.slice()
        var pref = await this.getPreference("netmirror_pref_video_resolution");
        for (var i in streams) {
            var stream = streams[i];
            if (stream.quality.indexOf(pref) > -1) {
                sortedStreams.push(stream);
                var index = copyStreams.indexOf(stream);
                if (index > -1) {
                    copyStreams.splice(index, 1);
                }
                break;
            }
        }
        return [...sortedStreams, ...copyStreams]
    }

    async getVideoList(url) {
        const baseUrl = this.getTVApi();
        const urlData = JSON.parse(url);
        const data = JSON.parse(await this.request(`/tv/playlist.php?id=${urlData.id}&t=${urlData.name}`, null, true));
        let videoList = [];
        let subtitles = [];
        let audios = [];
        for (const playlist of data) {
            var source = playlist.sources[0]
            var link = baseUrl + source.file;
            var headers =
            {
                'Origin': baseUrl,
                'Referer': `${baseUrl}/`
            };

            var resp = await new Client().get(link, headers);

            if (resp.statusCode === 200) {
                const masterPlaylist = resp.body;
                masterPlaylist.substringAfter('#EXT-X-MEDIA:').split('#EXT-X-MEDIA:').forEach(it => {
                    if (it.includes('TYPE=AUDIO')) {
                        const audioInfo = it.substringAfter('TYPE=AUDIO').substringBefore('\n');
                        const language = audioInfo.substringAfter('NAME="').substringBefore('"');
                        const url = audioInfo.substringAfter('URI="').substringBefore('"');
                        audios.push({ file: url, label: language });
                    }
                });

                masterPlaylist.substringAfter('#EXT-X-STREAM-INF:').split('#EXT-X-STREAM-INF:').forEach(it => {

                    var quality = `${it.substringAfter('RESOLUTION=').substringAfter('x').substringBefore(',')}p (${source.label})`;
                    let videoUrl = it.substringAfter('\n').substringBefore('\n');

                    if (!videoUrl.startsWith('http')) {
                        videoUrl = resp.request.url.substringBeforeLast('/') + `/${videoUrl}`;
                    }
                    var headers =
                    {
                        'Host': videoUrl.match(/^(?:https?:\/\/)?(?:www\.)?([^\/]+)/)[1],
                        'Origin': baseUrl,
                        'Referer': `${baseUrl}/`
                    };
                    videoList.push({ url: videoUrl, quality, originalUrl: videoUrl, headers });

                });
            }



            playlist.tracks.filter(track => track.kind === 'captions').forEach(track => {
                subtitles.push({
                    label: track.label,
                    file: track.file
                });
            });
        }


        videoList[0].audios = audios;
        videoList[0].subtitles = subtitles;
        return this.sortStreams(videoList);
    }

    getSourcePreferences() {
        return [{
            key: 'netmirror_pref_video_resolution',
            listPreference: {
                title: 'Preferred video resolution',
                summary: '',
                valueIndex: 0,
                entries: ["1080p", "720p", "480"],
                entryValues: ["1080", "720", "480"]
            }
        }, {
            "key": "netmirror_pref_display_name",
            "switchPreferenceCompat": {
                "title": "Display media name on home page",
                "summary": "Homepage loads faster by not calling details API",
                "value": false
            }
        },];
    }

}
