import '../../../../../../model/source.dart';

  Source get hentaixyuriSource => _hentaixyuriSource;
            
  Source _hentaixyuriSource = Source(
  itemType: ItemType.manga,
    name: "HentaiXYuri",
    baseUrl: "https://hentaixyuri.com",
    lang: "en",
    isNsfw:true,
    typeSource: "madara",
    iconUrl:"https://raw.githubusercontent.com/$repo/$branchName/dart/manga/multisrc/madara/src/hentaixyuri/icon.png",
    dateFormat:"MMM d, yyyy",
    dateFormatLocale:"en_us",
  );