// Countries and country sets as first entered (PLAN §4.6), inserted once by migration
// 20260927_141000_seed_geography. Frozen: later changes are made in the admin.
//
// Countries: every code in the UN M49 list (unstats.un.org/unsd/methodology/m49/overview,
// retrieved 2026-09-27) plus Kosovo (XK) and Taiwan (TW), which M49 does not list but ROR and
// funders use; their regions follow the usual convention. Names in English and Turkish come from
// the Unicode CLDR data in Node.js 24 (CLDR 48).
//
// Country sets: each list was taken from its official source on 2026-09-27 and checked again
// independently (sources and notes below).

// The values of the database enums as created by migration 20260927_140459_geography. Kept here
// rather than imported, so that later changes to the collections cannot change what this seed was.
type Region =
  'africa' | 'northern-america' | 'latin-america-caribbean' | 'asia' | 'europe' | 'oceania'
type Subregion =
  | 'northern-africa'
  | 'eastern-africa'
  | 'middle-africa'
  | 'southern-africa'
  | 'western-africa'
  | 'caribbean'
  | 'central-america'
  | 'south-america'
  | 'central-asia'
  | 'eastern-asia'
  | 'south-eastern-asia'
  | 'southern-asia'
  | 'western-asia'
  | 'eastern-europe'
  | 'northern-europe'
  | 'southern-europe'
  | 'western-europe'
  | 'australia-new-zealand'
  | 'melanesia'
  | 'micronesia'
  | 'polynesia'

export type CountrySeed = {
  code: string
  m49Code: string | null
  region: Region | null
  subregion: Subregion | null
  name: { en: string; tr: string }
}

export type CountrySetSeed = {
  slug: string
  label: string
  description: string
  countries: string[]
  sourceUrl: string
  lastVerifiedAt: string
  verificationNote: string
}

export const COUNTRIES_2026_09: CountrySeed[] = [
  {
    code: 'AD',
    m49Code: '020',
    region: 'europe',
    subregion: 'southern-europe',
    name: {
      en: 'Andorra',
      tr: 'Andorra',
    },
  },
  {
    code: 'AE',
    m49Code: '784',
    region: 'asia',
    subregion: 'western-asia',
    name: {
      en: 'United Arab Emirates',
      tr: 'Birleşik Arap Emirlikleri',
    },
  },
  {
    code: 'AF',
    m49Code: '004',
    region: 'asia',
    subregion: 'southern-asia',
    name: {
      en: 'Afghanistan',
      tr: 'Afganistan',
    },
  },
  {
    code: 'AG',
    m49Code: '028',
    region: 'latin-america-caribbean',
    subregion: 'caribbean',
    name: {
      en: 'Antigua & Barbuda',
      tr: 'Antigua ve Barbuda',
    },
  },
  {
    code: 'AI',
    m49Code: '660',
    region: 'latin-america-caribbean',
    subregion: 'caribbean',
    name: {
      en: 'Anguilla',
      tr: 'Anguilla',
    },
  },
  {
    code: 'AL',
    m49Code: '008',
    region: 'europe',
    subregion: 'southern-europe',
    name: {
      en: 'Albania',
      tr: 'Arnavutluk',
    },
  },
  {
    code: 'AM',
    m49Code: '051',
    region: 'asia',
    subregion: 'western-asia',
    name: {
      en: 'Armenia',
      tr: 'Ermenistan',
    },
  },
  {
    code: 'AO',
    m49Code: '024',
    region: 'africa',
    subregion: 'middle-africa',
    name: {
      en: 'Angola',
      tr: 'Angola',
    },
  },
  {
    code: 'AQ',
    m49Code: '010',
    region: null,
    subregion: null,
    name: {
      en: 'Antarctica',
      tr: 'Antarktika',
    },
  },
  {
    code: 'AR',
    m49Code: '032',
    region: 'latin-america-caribbean',
    subregion: 'south-america',
    name: {
      en: 'Argentina',
      tr: 'Arjantin',
    },
  },
  {
    code: 'AS',
    m49Code: '016',
    region: 'oceania',
    subregion: 'polynesia',
    name: {
      en: 'American Samoa',
      tr: 'Amerikan Samoası',
    },
  },
  {
    code: 'AT',
    m49Code: '040',
    region: 'europe',
    subregion: 'western-europe',
    name: {
      en: 'Austria',
      tr: 'Avusturya',
    },
  },
  {
    code: 'AU',
    m49Code: '036',
    region: 'oceania',
    subregion: 'australia-new-zealand',
    name: {
      en: 'Australia',
      tr: 'Avustralya',
    },
  },
  {
    code: 'AW',
    m49Code: '533',
    region: 'latin-america-caribbean',
    subregion: 'caribbean',
    name: {
      en: 'Aruba',
      tr: 'Aruba',
    },
  },
  {
    code: 'AX',
    m49Code: '248',
    region: 'europe',
    subregion: 'northern-europe',
    name: {
      en: 'Åland Islands',
      tr: 'Åland Adaları',
    },
  },
  {
    code: 'AZ',
    m49Code: '031',
    region: 'asia',
    subregion: 'western-asia',
    name: {
      en: 'Azerbaijan',
      tr: 'Azerbaycan',
    },
  },
  {
    code: 'BA',
    m49Code: '070',
    region: 'europe',
    subregion: 'southern-europe',
    name: {
      en: 'Bosnia & Herzegovina',
      tr: 'Bosna-Hersek',
    },
  },
  {
    code: 'BB',
    m49Code: '052',
    region: 'latin-america-caribbean',
    subregion: 'caribbean',
    name: {
      en: 'Barbados',
      tr: 'Barbados',
    },
  },
  {
    code: 'BD',
    m49Code: '050',
    region: 'asia',
    subregion: 'southern-asia',
    name: {
      en: 'Bangladesh',
      tr: 'Bangladeş',
    },
  },
  {
    code: 'BE',
    m49Code: '056',
    region: 'europe',
    subregion: 'western-europe',
    name: {
      en: 'Belgium',
      tr: 'Belçika',
    },
  },
  {
    code: 'BF',
    m49Code: '854',
    region: 'africa',
    subregion: 'western-africa',
    name: {
      en: 'Burkina Faso',
      tr: 'Burkina Faso',
    },
  },
  {
    code: 'BG',
    m49Code: '100',
    region: 'europe',
    subregion: 'eastern-europe',
    name: {
      en: 'Bulgaria',
      tr: 'Bulgaristan',
    },
  },
  {
    code: 'BH',
    m49Code: '048',
    region: 'asia',
    subregion: 'western-asia',
    name: {
      en: 'Bahrain',
      tr: 'Bahreyn',
    },
  },
  {
    code: 'BI',
    m49Code: '108',
    region: 'africa',
    subregion: 'eastern-africa',
    name: {
      en: 'Burundi',
      tr: 'Burundi',
    },
  },
  {
    code: 'BJ',
    m49Code: '204',
    region: 'africa',
    subregion: 'western-africa',
    name: {
      en: 'Benin',
      tr: 'Benin',
    },
  },
  {
    code: 'BL',
    m49Code: '652',
    region: 'latin-america-caribbean',
    subregion: 'caribbean',
    name: {
      en: 'St. Barthélemy',
      tr: 'Saint Barthelemy',
    },
  },
  {
    code: 'BM',
    m49Code: '060',
    region: 'northern-america',
    subregion: null,
    name: {
      en: 'Bermuda',
      tr: 'Bermuda',
    },
  },
  {
    code: 'BN',
    m49Code: '096',
    region: 'asia',
    subregion: 'south-eastern-asia',
    name: {
      en: 'Brunei',
      tr: 'Brunei',
    },
  },
  {
    code: 'BO',
    m49Code: '068',
    region: 'latin-america-caribbean',
    subregion: 'south-america',
    name: {
      en: 'Bolivia',
      tr: 'Bolivya',
    },
  },
  {
    code: 'BQ',
    m49Code: '535',
    region: 'latin-america-caribbean',
    subregion: 'caribbean',
    name: {
      en: 'Caribbean Netherlands',
      tr: 'Karayip Hollandası',
    },
  },
  {
    code: 'BR',
    m49Code: '076',
    region: 'latin-america-caribbean',
    subregion: 'south-america',
    name: {
      en: 'Brazil',
      tr: 'Brezilya',
    },
  },
  {
    code: 'BS',
    m49Code: '044',
    region: 'latin-america-caribbean',
    subregion: 'caribbean',
    name: {
      en: 'Bahamas',
      tr: 'Bahamalar',
    },
  },
  {
    code: 'BT',
    m49Code: '064',
    region: 'asia',
    subregion: 'southern-asia',
    name: {
      en: 'Bhutan',
      tr: 'Butan',
    },
  },
  {
    code: 'BV',
    m49Code: '074',
    region: 'latin-america-caribbean',
    subregion: 'south-america',
    name: {
      en: 'Bouvet Island',
      tr: 'Bouvet Adası',
    },
  },
  {
    code: 'BW',
    m49Code: '072',
    region: 'africa',
    subregion: 'southern-africa',
    name: {
      en: 'Botswana',
      tr: 'Botsvana',
    },
  },
  {
    code: 'BY',
    m49Code: '112',
    region: 'europe',
    subregion: 'eastern-europe',
    name: {
      en: 'Belarus',
      tr: 'Belarus',
    },
  },
  {
    code: 'BZ',
    m49Code: '084',
    region: 'latin-america-caribbean',
    subregion: 'central-america',
    name: {
      en: 'Belize',
      tr: 'Belize',
    },
  },
  {
    code: 'CA',
    m49Code: '124',
    region: 'northern-america',
    subregion: null,
    name: {
      en: 'Canada',
      tr: 'Kanada',
    },
  },
  {
    code: 'CC',
    m49Code: '166',
    region: 'oceania',
    subregion: 'australia-new-zealand',
    name: {
      en: 'Cocos (Keeling) Islands',
      tr: 'Cocos (Keeling) Adaları',
    },
  },
  {
    code: 'CD',
    m49Code: '180',
    region: 'africa',
    subregion: 'middle-africa',
    name: {
      en: 'Congo - Kinshasa',
      tr: 'Kongo - Kinşasa',
    },
  },
  {
    code: 'CF',
    m49Code: '140',
    region: 'africa',
    subregion: 'middle-africa',
    name: {
      en: 'Central African Republic',
      tr: 'Orta Afrika Cumhuriyeti',
    },
  },
  {
    code: 'CG',
    m49Code: '178',
    region: 'africa',
    subregion: 'middle-africa',
    name: {
      en: 'Congo - Brazzaville',
      tr: 'Kongo - Brazavil',
    },
  },
  {
    code: 'CH',
    m49Code: '756',
    region: 'europe',
    subregion: 'western-europe',
    name: {
      en: 'Switzerland',
      tr: 'İsviçre',
    },
  },
  {
    code: 'CI',
    m49Code: '384',
    region: 'africa',
    subregion: 'western-africa',
    name: {
      en: 'Côte d’Ivoire',
      tr: 'Côte d’Ivoire',
    },
  },
  {
    code: 'CK',
    m49Code: '184',
    region: 'oceania',
    subregion: 'polynesia',
    name: {
      en: 'Cook Islands',
      tr: 'Cook Adaları',
    },
  },
  {
    code: 'CL',
    m49Code: '152',
    region: 'latin-america-caribbean',
    subregion: 'south-america',
    name: {
      en: 'Chile',
      tr: 'Şili',
    },
  },
  {
    code: 'CM',
    m49Code: '120',
    region: 'africa',
    subregion: 'middle-africa',
    name: {
      en: 'Cameroon',
      tr: 'Kamerun',
    },
  },
  {
    code: 'CN',
    m49Code: '156',
    region: 'asia',
    subregion: 'eastern-asia',
    name: {
      en: 'China',
      tr: 'Çin',
    },
  },
  {
    code: 'CO',
    m49Code: '170',
    region: 'latin-america-caribbean',
    subregion: 'south-america',
    name: {
      en: 'Colombia',
      tr: 'Kolombiya',
    },
  },
  {
    code: 'CR',
    m49Code: '188',
    region: 'latin-america-caribbean',
    subregion: 'central-america',
    name: {
      en: 'Costa Rica',
      tr: 'Kosta Rika',
    },
  },
  {
    code: 'CU',
    m49Code: '192',
    region: 'latin-america-caribbean',
    subregion: 'caribbean',
    name: {
      en: 'Cuba',
      tr: 'Küba',
    },
  },
  {
    code: 'CV',
    m49Code: '132',
    region: 'africa',
    subregion: 'western-africa',
    name: {
      en: 'Cape Verde',
      tr: 'Cabo Verde',
    },
  },
  {
    code: 'CW',
    m49Code: '531',
    region: 'latin-america-caribbean',
    subregion: 'caribbean',
    name: {
      en: 'Curaçao',
      tr: 'Curaçao',
    },
  },
  {
    code: 'CX',
    m49Code: '162',
    region: 'oceania',
    subregion: 'australia-new-zealand',
    name: {
      en: 'Christmas Island',
      tr: 'Christmas Adası',
    },
  },
  {
    code: 'CY',
    m49Code: '196',
    region: 'asia',
    subregion: 'western-asia',
    name: {
      en: 'Cyprus',
      tr: 'Kıbrıs',
    },
  },
  {
    code: 'CZ',
    m49Code: '203',
    region: 'europe',
    subregion: 'eastern-europe',
    name: {
      en: 'Czechia',
      tr: 'Çekya',
    },
  },
  {
    code: 'DE',
    m49Code: '276',
    region: 'europe',
    subregion: 'western-europe',
    name: {
      en: 'Germany',
      tr: 'Almanya',
    },
  },
  {
    code: 'DJ',
    m49Code: '262',
    region: 'africa',
    subregion: 'eastern-africa',
    name: {
      en: 'Djibouti',
      tr: 'Cibuti',
    },
  },
  {
    code: 'DK',
    m49Code: '208',
    region: 'europe',
    subregion: 'northern-europe',
    name: {
      en: 'Denmark',
      tr: 'Danimarka',
    },
  },
  {
    code: 'DM',
    m49Code: '212',
    region: 'latin-america-caribbean',
    subregion: 'caribbean',
    name: {
      en: 'Dominica',
      tr: 'Dominika',
    },
  },
  {
    code: 'DO',
    m49Code: '214',
    region: 'latin-america-caribbean',
    subregion: 'caribbean',
    name: {
      en: 'Dominican Republic',
      tr: 'Dominik Cumhuriyeti',
    },
  },
  {
    code: 'DZ',
    m49Code: '012',
    region: 'africa',
    subregion: 'northern-africa',
    name: {
      en: 'Algeria',
      tr: 'Cezayir',
    },
  },
  {
    code: 'EC',
    m49Code: '218',
    region: 'latin-america-caribbean',
    subregion: 'south-america',
    name: {
      en: 'Ecuador',
      tr: 'Ekvador',
    },
  },
  {
    code: 'EE',
    m49Code: '233',
    region: 'europe',
    subregion: 'northern-europe',
    name: {
      en: 'Estonia',
      tr: 'Estonya',
    },
  },
  {
    code: 'EG',
    m49Code: '818',
    region: 'africa',
    subregion: 'northern-africa',
    name: {
      en: 'Egypt',
      tr: 'Mısır',
    },
  },
  {
    code: 'EH',
    m49Code: '732',
    region: 'africa',
    subregion: 'northern-africa',
    name: {
      en: 'Western Sahara',
      tr: 'Batı Sahra',
    },
  },
  {
    code: 'ER',
    m49Code: '232',
    region: 'africa',
    subregion: 'eastern-africa',
    name: {
      en: 'Eritrea',
      tr: 'Eritre',
    },
  },
  {
    code: 'ES',
    m49Code: '724',
    region: 'europe',
    subregion: 'southern-europe',
    name: {
      en: 'Spain',
      tr: 'İspanya',
    },
  },
  {
    code: 'ET',
    m49Code: '231',
    region: 'africa',
    subregion: 'eastern-africa',
    name: {
      en: 'Ethiopia',
      tr: 'Etiyopya',
    },
  },
  {
    code: 'FI',
    m49Code: '246',
    region: 'europe',
    subregion: 'northern-europe',
    name: {
      en: 'Finland',
      tr: 'Finlandiya',
    },
  },
  {
    code: 'FJ',
    m49Code: '242',
    region: 'oceania',
    subregion: 'melanesia',
    name: {
      en: 'Fiji',
      tr: 'Fiji',
    },
  },
  {
    code: 'FK',
    m49Code: '238',
    region: 'latin-america-caribbean',
    subregion: 'south-america',
    name: {
      en: 'Falkland Islands',
      tr: 'Falkland Adaları',
    },
  },
  {
    code: 'FM',
    m49Code: '583',
    region: 'oceania',
    subregion: 'micronesia',
    name: {
      en: 'Micronesia',
      tr: 'Mikronezya',
    },
  },
  {
    code: 'FO',
    m49Code: '234',
    region: 'europe',
    subregion: 'northern-europe',
    name: {
      en: 'Faroe Islands',
      tr: 'Faroe Adaları',
    },
  },
  {
    code: 'FR',
    m49Code: '250',
    region: 'europe',
    subregion: 'western-europe',
    name: {
      en: 'France',
      tr: 'Fransa',
    },
  },
  {
    code: 'GA',
    m49Code: '266',
    region: 'africa',
    subregion: 'middle-africa',
    name: {
      en: 'Gabon',
      tr: 'Gabon',
    },
  },
  {
    code: 'GB',
    m49Code: '826',
    region: 'europe',
    subregion: 'northern-europe',
    name: {
      en: 'United Kingdom',
      tr: 'Birleşik Krallık',
    },
  },
  {
    code: 'GD',
    m49Code: '308',
    region: 'latin-america-caribbean',
    subregion: 'caribbean',
    name: {
      en: 'Grenada',
      tr: 'Grenada',
    },
  },
  {
    code: 'GE',
    m49Code: '268',
    region: 'asia',
    subregion: 'western-asia',
    name: {
      en: 'Georgia',
      tr: 'Gürcistan',
    },
  },
  {
    code: 'GF',
    m49Code: '254',
    region: 'latin-america-caribbean',
    subregion: 'south-america',
    name: {
      en: 'French Guiana',
      tr: 'Fransız Guyanası',
    },
  },
  {
    code: 'GG',
    m49Code: '831',
    region: 'europe',
    subregion: 'northern-europe',
    name: {
      en: 'Guernsey',
      tr: 'Guernsey',
    },
  },
  {
    code: 'GH',
    m49Code: '288',
    region: 'africa',
    subregion: 'western-africa',
    name: {
      en: 'Ghana',
      tr: 'Gana',
    },
  },
  {
    code: 'GI',
    m49Code: '292',
    region: 'europe',
    subregion: 'southern-europe',
    name: {
      en: 'Gibraltar',
      tr: 'Cebelitarık',
    },
  },
  {
    code: 'GL',
    m49Code: '304',
    region: 'northern-america',
    subregion: null,
    name: {
      en: 'Greenland',
      tr: 'Grönland',
    },
  },
  {
    code: 'GM',
    m49Code: '270',
    region: 'africa',
    subregion: 'western-africa',
    name: {
      en: 'Gambia',
      tr: 'Gambiya',
    },
  },
  {
    code: 'GN',
    m49Code: '324',
    region: 'africa',
    subregion: 'western-africa',
    name: {
      en: 'Guinea',
      tr: 'Gine',
    },
  },
  {
    code: 'GP',
    m49Code: '312',
    region: 'latin-america-caribbean',
    subregion: 'caribbean',
    name: {
      en: 'Guadeloupe',
      tr: 'Guadeloupe',
    },
  },
  {
    code: 'GQ',
    m49Code: '226',
    region: 'africa',
    subregion: 'middle-africa',
    name: {
      en: 'Equatorial Guinea',
      tr: 'Ekvator Ginesi',
    },
  },
  {
    code: 'GR',
    m49Code: '300',
    region: 'europe',
    subregion: 'southern-europe',
    name: {
      en: 'Greece',
      tr: 'Yunanistan',
    },
  },
  {
    code: 'GS',
    m49Code: '239',
    region: 'latin-america-caribbean',
    subregion: 'south-america',
    name: {
      en: 'South Georgia & South Sandwich Islands',
      tr: 'Güney Georgia ve Güney Sandwich Adaları',
    },
  },
  {
    code: 'GT',
    m49Code: '320',
    region: 'latin-america-caribbean',
    subregion: 'central-america',
    name: {
      en: 'Guatemala',
      tr: 'Guatemala',
    },
  },
  {
    code: 'GU',
    m49Code: '316',
    region: 'oceania',
    subregion: 'micronesia',
    name: {
      en: 'Guam',
      tr: 'Guam',
    },
  },
  {
    code: 'GW',
    m49Code: '624',
    region: 'africa',
    subregion: 'western-africa',
    name: {
      en: 'Guinea-Bissau',
      tr: 'Gine-Bissau',
    },
  },
  {
    code: 'GY',
    m49Code: '328',
    region: 'latin-america-caribbean',
    subregion: 'south-america',
    name: {
      en: 'Guyana',
      tr: 'Guyana',
    },
  },
  {
    code: 'HK',
    m49Code: '344',
    region: 'asia',
    subregion: 'eastern-asia',
    name: {
      en: 'Hong Kong SAR China',
      tr: 'Çin Hong Kong ÖİB',
    },
  },
  {
    code: 'HM',
    m49Code: '334',
    region: 'oceania',
    subregion: 'australia-new-zealand',
    name: {
      en: 'Heard & McDonald Islands',
      tr: 'Heard Adası ve McDonald Adaları',
    },
  },
  {
    code: 'HN',
    m49Code: '340',
    region: 'latin-america-caribbean',
    subregion: 'central-america',
    name: {
      en: 'Honduras',
      tr: 'Honduras',
    },
  },
  {
    code: 'HR',
    m49Code: '191',
    region: 'europe',
    subregion: 'southern-europe',
    name: {
      en: 'Croatia',
      tr: 'Hırvatistan',
    },
  },
  {
    code: 'HT',
    m49Code: '332',
    region: 'latin-america-caribbean',
    subregion: 'caribbean',
    name: {
      en: 'Haiti',
      tr: 'Haiti',
    },
  },
  {
    code: 'HU',
    m49Code: '348',
    region: 'europe',
    subregion: 'eastern-europe',
    name: {
      en: 'Hungary',
      tr: 'Macaristan',
    },
  },
  {
    code: 'ID',
    m49Code: '360',
    region: 'asia',
    subregion: 'south-eastern-asia',
    name: {
      en: 'Indonesia',
      tr: 'Endonezya',
    },
  },
  {
    code: 'IE',
    m49Code: '372',
    region: 'europe',
    subregion: 'northern-europe',
    name: {
      en: 'Ireland',
      tr: 'İrlanda',
    },
  },
  {
    code: 'IL',
    m49Code: '376',
    region: 'asia',
    subregion: 'western-asia',
    name: {
      en: 'Israel',
      tr: 'İsrail',
    },
  },
  {
    code: 'IM',
    m49Code: '833',
    region: 'europe',
    subregion: 'northern-europe',
    name: {
      en: 'Isle of Man',
      tr: 'Man Adası',
    },
  },
  {
    code: 'IN',
    m49Code: '356',
    region: 'asia',
    subregion: 'southern-asia',
    name: {
      en: 'India',
      tr: 'Hindistan',
    },
  },
  {
    code: 'IO',
    m49Code: '086',
    region: 'africa',
    subregion: 'eastern-africa',
    name: {
      en: 'British Indian Ocean Territory',
      tr: 'Britanya Hint Okyanusu Toprakları',
    },
  },
  {
    code: 'IQ',
    m49Code: '368',
    region: 'asia',
    subregion: 'western-asia',
    name: {
      en: 'Iraq',
      tr: 'Irak',
    },
  },
  {
    code: 'IR',
    m49Code: '364',
    region: 'asia',
    subregion: 'southern-asia',
    name: {
      en: 'Iran',
      tr: 'İran',
    },
  },
  {
    code: 'IS',
    m49Code: '352',
    region: 'europe',
    subregion: 'northern-europe',
    name: {
      en: 'Iceland',
      tr: 'İzlanda',
    },
  },
  {
    code: 'IT',
    m49Code: '380',
    region: 'europe',
    subregion: 'southern-europe',
    name: {
      en: 'Italy',
      tr: 'İtalya',
    },
  },
  {
    code: 'JE',
    m49Code: '832',
    region: 'europe',
    subregion: 'northern-europe',
    name: {
      en: 'Jersey',
      tr: 'Jersey',
    },
  },
  {
    code: 'JM',
    m49Code: '388',
    region: 'latin-america-caribbean',
    subregion: 'caribbean',
    name: {
      en: 'Jamaica',
      tr: 'Jamaika',
    },
  },
  {
    code: 'JO',
    m49Code: '400',
    region: 'asia',
    subregion: 'western-asia',
    name: {
      en: 'Jordan',
      tr: 'Ürdün',
    },
  },
  {
    code: 'JP',
    m49Code: '392',
    region: 'asia',
    subregion: 'eastern-asia',
    name: {
      en: 'Japan',
      tr: 'Japonya',
    },
  },
  {
    code: 'KE',
    m49Code: '404',
    region: 'africa',
    subregion: 'eastern-africa',
    name: {
      en: 'Kenya',
      tr: 'Kenya',
    },
  },
  {
    code: 'KG',
    m49Code: '417',
    region: 'asia',
    subregion: 'central-asia',
    name: {
      en: 'Kyrgyzstan',
      tr: 'Kırgızistan',
    },
  },
  {
    code: 'KH',
    m49Code: '116',
    region: 'asia',
    subregion: 'south-eastern-asia',
    name: {
      en: 'Cambodia',
      tr: 'Kamboçya',
    },
  },
  {
    code: 'KI',
    m49Code: '296',
    region: 'oceania',
    subregion: 'micronesia',
    name: {
      en: 'Kiribati',
      tr: 'Kiribati',
    },
  },
  {
    code: 'KM',
    m49Code: '174',
    region: 'africa',
    subregion: 'eastern-africa',
    name: {
      en: 'Comoros',
      tr: 'Komorlar',
    },
  },
  {
    code: 'KN',
    m49Code: '659',
    region: 'latin-america-caribbean',
    subregion: 'caribbean',
    name: {
      en: 'St. Kitts & Nevis',
      tr: 'Saint Kitts ve Nevis',
    },
  },
  {
    code: 'KP',
    m49Code: '408',
    region: 'asia',
    subregion: 'eastern-asia',
    name: {
      en: 'North Korea',
      tr: 'Kuzey Kore',
    },
  },
  {
    code: 'KR',
    m49Code: '410',
    region: 'asia',
    subregion: 'eastern-asia',
    name: {
      en: 'South Korea',
      tr: 'Güney Kore',
    },
  },
  {
    code: 'KW',
    m49Code: '414',
    region: 'asia',
    subregion: 'western-asia',
    name: {
      en: 'Kuwait',
      tr: 'Kuveyt',
    },
  },
  {
    code: 'KY',
    m49Code: '136',
    region: 'latin-america-caribbean',
    subregion: 'caribbean',
    name: {
      en: 'Cayman Islands',
      tr: 'Cayman Adaları',
    },
  },
  {
    code: 'KZ',
    m49Code: '398',
    region: 'asia',
    subregion: 'central-asia',
    name: {
      en: 'Kazakhstan',
      tr: 'Kazakistan',
    },
  },
  {
    code: 'LA',
    m49Code: '418',
    region: 'asia',
    subregion: 'south-eastern-asia',
    name: {
      en: 'Laos',
      tr: 'Laos',
    },
  },
  {
    code: 'LB',
    m49Code: '422',
    region: 'asia',
    subregion: 'western-asia',
    name: {
      en: 'Lebanon',
      tr: 'Lübnan',
    },
  },
  {
    code: 'LC',
    m49Code: '662',
    region: 'latin-america-caribbean',
    subregion: 'caribbean',
    name: {
      en: 'St. Lucia',
      tr: 'Saint Lucia',
    },
  },
  {
    code: 'LI',
    m49Code: '438',
    region: 'europe',
    subregion: 'western-europe',
    name: {
      en: 'Liechtenstein',
      tr: 'Liechtenstein',
    },
  },
  {
    code: 'LK',
    m49Code: '144',
    region: 'asia',
    subregion: 'southern-asia',
    name: {
      en: 'Sri Lanka',
      tr: 'Sri Lanka',
    },
  },
  {
    code: 'LR',
    m49Code: '430',
    region: 'africa',
    subregion: 'western-africa',
    name: {
      en: 'Liberia',
      tr: 'Liberya',
    },
  },
  {
    code: 'LS',
    m49Code: '426',
    region: 'africa',
    subregion: 'southern-africa',
    name: {
      en: 'Lesotho',
      tr: 'Lesotho',
    },
  },
  {
    code: 'LT',
    m49Code: '440',
    region: 'europe',
    subregion: 'northern-europe',
    name: {
      en: 'Lithuania',
      tr: 'Litvanya',
    },
  },
  {
    code: 'LU',
    m49Code: '442',
    region: 'europe',
    subregion: 'western-europe',
    name: {
      en: 'Luxembourg',
      tr: 'Lüksemburg',
    },
  },
  {
    code: 'LV',
    m49Code: '428',
    region: 'europe',
    subregion: 'northern-europe',
    name: {
      en: 'Latvia',
      tr: 'Letonya',
    },
  },
  {
    code: 'LY',
    m49Code: '434',
    region: 'africa',
    subregion: 'northern-africa',
    name: {
      en: 'Libya',
      tr: 'Libya',
    },
  },
  {
    code: 'MA',
    m49Code: '504',
    region: 'africa',
    subregion: 'northern-africa',
    name: {
      en: 'Morocco',
      tr: 'Fas',
    },
  },
  {
    code: 'MC',
    m49Code: '492',
    region: 'europe',
    subregion: 'western-europe',
    name: {
      en: 'Monaco',
      tr: 'Monako',
    },
  },
  {
    code: 'MD',
    m49Code: '498',
    region: 'europe',
    subregion: 'eastern-europe',
    name: {
      en: 'Moldova',
      tr: 'Moldova',
    },
  },
  {
    code: 'ME',
    m49Code: '499',
    region: 'europe',
    subregion: 'southern-europe',
    name: {
      en: 'Montenegro',
      tr: 'Karadağ',
    },
  },
  {
    code: 'MF',
    m49Code: '663',
    region: 'latin-america-caribbean',
    subregion: 'caribbean',
    name: {
      en: 'St. Martin',
      tr: 'Saint Martin',
    },
  },
  {
    code: 'MG',
    m49Code: '450',
    region: 'africa',
    subregion: 'eastern-africa',
    name: {
      en: 'Madagascar',
      tr: 'Madagaskar',
    },
  },
  {
    code: 'MH',
    m49Code: '584',
    region: 'oceania',
    subregion: 'micronesia',
    name: {
      en: 'Marshall Islands',
      tr: 'Marshall Adaları',
    },
  },
  {
    code: 'MK',
    m49Code: '807',
    region: 'europe',
    subregion: 'southern-europe',
    name: {
      en: 'North Macedonia',
      tr: 'Kuzey Makedonya',
    },
  },
  {
    code: 'ML',
    m49Code: '466',
    region: 'africa',
    subregion: 'western-africa',
    name: {
      en: 'Mali',
      tr: 'Mali',
    },
  },
  {
    code: 'MM',
    m49Code: '104',
    region: 'asia',
    subregion: 'south-eastern-asia',
    name: {
      en: 'Myanmar (Burma)',
      tr: 'Myanmar (Burma)',
    },
  },
  {
    code: 'MN',
    m49Code: '496',
    region: 'asia',
    subregion: 'eastern-asia',
    name: {
      en: 'Mongolia',
      tr: 'Moğolistan',
    },
  },
  {
    code: 'MO',
    m49Code: '446',
    region: 'asia',
    subregion: 'eastern-asia',
    name: {
      en: 'Macao SAR China',
      tr: 'Çin Makao ÖİB',
    },
  },
  {
    code: 'MP',
    m49Code: '580',
    region: 'oceania',
    subregion: 'micronesia',
    name: {
      en: 'Northern Mariana Islands',
      tr: 'Kuzey Mariana Adaları',
    },
  },
  {
    code: 'MQ',
    m49Code: '474',
    region: 'latin-america-caribbean',
    subregion: 'caribbean',
    name: {
      en: 'Martinique',
      tr: 'Martinik',
    },
  },
  {
    code: 'MR',
    m49Code: '478',
    region: 'africa',
    subregion: 'western-africa',
    name: {
      en: 'Mauritania',
      tr: 'Moritanya',
    },
  },
  {
    code: 'MS',
    m49Code: '500',
    region: 'latin-america-caribbean',
    subregion: 'caribbean',
    name: {
      en: 'Montserrat',
      tr: 'Montserrat',
    },
  },
  {
    code: 'MT',
    m49Code: '470',
    region: 'europe',
    subregion: 'southern-europe',
    name: {
      en: 'Malta',
      tr: 'Malta',
    },
  },
  {
    code: 'MU',
    m49Code: '480',
    region: 'africa',
    subregion: 'eastern-africa',
    name: {
      en: 'Mauritius',
      tr: 'Mauritius',
    },
  },
  {
    code: 'MV',
    m49Code: '462',
    region: 'asia',
    subregion: 'southern-asia',
    name: {
      en: 'Maldives',
      tr: 'Maldivler',
    },
  },
  {
    code: 'MW',
    m49Code: '454',
    region: 'africa',
    subregion: 'eastern-africa',
    name: {
      en: 'Malawi',
      tr: 'Malavi',
    },
  },
  {
    code: 'MX',
    m49Code: '484',
    region: 'latin-america-caribbean',
    subregion: 'central-america',
    name: {
      en: 'Mexico',
      tr: 'Meksika',
    },
  },
  {
    code: 'MY',
    m49Code: '458',
    region: 'asia',
    subregion: 'south-eastern-asia',
    name: {
      en: 'Malaysia',
      tr: 'Malezya',
    },
  },
  {
    code: 'MZ',
    m49Code: '508',
    region: 'africa',
    subregion: 'eastern-africa',
    name: {
      en: 'Mozambique',
      tr: 'Mozambik',
    },
  },
  {
    code: 'NA',
    m49Code: '516',
    region: 'africa',
    subregion: 'southern-africa',
    name: {
      en: 'Namibia',
      tr: 'Namibya',
    },
  },
  {
    code: 'NC',
    m49Code: '540',
    region: 'oceania',
    subregion: 'melanesia',
    name: {
      en: 'New Caledonia',
      tr: 'Yeni Kaledonya',
    },
  },
  {
    code: 'NE',
    m49Code: '562',
    region: 'africa',
    subregion: 'western-africa',
    name: {
      en: 'Niger',
      tr: 'Nijer',
    },
  },
  {
    code: 'NF',
    m49Code: '574',
    region: 'oceania',
    subregion: 'australia-new-zealand',
    name: {
      en: 'Norfolk Island',
      tr: 'Norfolk Adası',
    },
  },
  {
    code: 'NG',
    m49Code: '566',
    region: 'africa',
    subregion: 'western-africa',
    name: {
      en: 'Nigeria',
      tr: 'Nijerya',
    },
  },
  {
    code: 'NI',
    m49Code: '558',
    region: 'latin-america-caribbean',
    subregion: 'central-america',
    name: {
      en: 'Nicaragua',
      tr: 'Nikaragua',
    },
  },
  {
    code: 'NL',
    m49Code: '528',
    region: 'europe',
    subregion: 'western-europe',
    name: {
      en: 'Netherlands',
      tr: 'Hollanda',
    },
  },
  {
    code: 'NO',
    m49Code: '578',
    region: 'europe',
    subregion: 'northern-europe',
    name: {
      en: 'Norway',
      tr: 'Norveç',
    },
  },
  {
    code: 'NP',
    m49Code: '524',
    region: 'asia',
    subregion: 'southern-asia',
    name: {
      en: 'Nepal',
      tr: 'Nepal',
    },
  },
  {
    code: 'NR',
    m49Code: '520',
    region: 'oceania',
    subregion: 'micronesia',
    name: {
      en: 'Nauru',
      tr: 'Nauru',
    },
  },
  {
    code: 'NU',
    m49Code: '570',
    region: 'oceania',
    subregion: 'polynesia',
    name: {
      en: 'Niue',
      tr: 'Niue',
    },
  },
  {
    code: 'NZ',
    m49Code: '554',
    region: 'oceania',
    subregion: 'australia-new-zealand',
    name: {
      en: 'New Zealand',
      tr: 'Yeni Zelanda',
    },
  },
  {
    code: 'OM',
    m49Code: '512',
    region: 'asia',
    subregion: 'western-asia',
    name: {
      en: 'Oman',
      tr: 'Umman',
    },
  },
  {
    code: 'PA',
    m49Code: '591',
    region: 'latin-america-caribbean',
    subregion: 'central-america',
    name: {
      en: 'Panama',
      tr: 'Panama',
    },
  },
  {
    code: 'PE',
    m49Code: '604',
    region: 'latin-america-caribbean',
    subregion: 'south-america',
    name: {
      en: 'Peru',
      tr: 'Peru',
    },
  },
  {
    code: 'PF',
    m49Code: '258',
    region: 'oceania',
    subregion: 'polynesia',
    name: {
      en: 'French Polynesia',
      tr: 'Fransız Polinezyası',
    },
  },
  {
    code: 'PG',
    m49Code: '598',
    region: 'oceania',
    subregion: 'melanesia',
    name: {
      en: 'Papua New Guinea',
      tr: 'Papua Yeni Gine',
    },
  },
  {
    code: 'PH',
    m49Code: '608',
    region: 'asia',
    subregion: 'south-eastern-asia',
    name: {
      en: 'Philippines',
      tr: 'Filipinler',
    },
  },
  {
    code: 'PK',
    m49Code: '586',
    region: 'asia',
    subregion: 'southern-asia',
    name: {
      en: 'Pakistan',
      tr: 'Pakistan',
    },
  },
  {
    code: 'PL',
    m49Code: '616',
    region: 'europe',
    subregion: 'eastern-europe',
    name: {
      en: 'Poland',
      tr: 'Polonya',
    },
  },
  {
    code: 'PM',
    m49Code: '666',
    region: 'northern-america',
    subregion: null,
    name: {
      en: 'St. Pierre & Miquelon',
      tr: 'Saint Pierre ve Miquelon',
    },
  },
  {
    code: 'PN',
    m49Code: '612',
    region: 'oceania',
    subregion: 'polynesia',
    name: {
      en: 'Pitcairn Islands',
      tr: 'Pitcairn Adaları',
    },
  },
  {
    code: 'PR',
    m49Code: '630',
    region: 'latin-america-caribbean',
    subregion: 'caribbean',
    name: {
      en: 'Puerto Rico',
      tr: 'Porto Riko',
    },
  },
  {
    code: 'PS',
    m49Code: '275',
    region: 'asia',
    subregion: 'western-asia',
    name: {
      en: 'Palestinian Territories',
      tr: 'Filistin Bölgeleri',
    },
  },
  {
    code: 'PT',
    m49Code: '620',
    region: 'europe',
    subregion: 'southern-europe',
    name: {
      en: 'Portugal',
      tr: 'Portekiz',
    },
  },
  {
    code: 'PW',
    m49Code: '585',
    region: 'oceania',
    subregion: 'micronesia',
    name: {
      en: 'Palau',
      tr: 'Palau',
    },
  },
  {
    code: 'PY',
    m49Code: '600',
    region: 'latin-america-caribbean',
    subregion: 'south-america',
    name: {
      en: 'Paraguay',
      tr: 'Paraguay',
    },
  },
  {
    code: 'QA',
    m49Code: '634',
    region: 'asia',
    subregion: 'western-asia',
    name: {
      en: 'Qatar',
      tr: 'Katar',
    },
  },
  {
    code: 'RE',
    m49Code: '638',
    region: 'africa',
    subregion: 'eastern-africa',
    name: {
      en: 'Réunion',
      tr: 'Reunion',
    },
  },
  {
    code: 'RO',
    m49Code: '642',
    region: 'europe',
    subregion: 'eastern-europe',
    name: {
      en: 'Romania',
      tr: 'Romanya',
    },
  },
  {
    code: 'RS',
    m49Code: '688',
    region: 'europe',
    subregion: 'southern-europe',
    name: {
      en: 'Serbia',
      tr: 'Sırbistan',
    },
  },
  {
    code: 'RU',
    m49Code: '643',
    region: 'europe',
    subregion: 'eastern-europe',
    name: {
      en: 'Russia',
      tr: 'Rusya',
    },
  },
  {
    code: 'RW',
    m49Code: '646',
    region: 'africa',
    subregion: 'eastern-africa',
    name: {
      en: 'Rwanda',
      tr: 'Ruanda',
    },
  },
  {
    code: 'SA',
    m49Code: '682',
    region: 'asia',
    subregion: 'western-asia',
    name: {
      en: 'Saudi Arabia',
      tr: 'Suudi Arabistan',
    },
  },
  {
    code: 'SB',
    m49Code: '090',
    region: 'oceania',
    subregion: 'melanesia',
    name: {
      en: 'Solomon Islands',
      tr: 'Solomon Adaları',
    },
  },
  {
    code: 'SC',
    m49Code: '690',
    region: 'africa',
    subregion: 'eastern-africa',
    name: {
      en: 'Seychelles',
      tr: 'Seyşeller',
    },
  },
  {
    code: 'SD',
    m49Code: '729',
    region: 'africa',
    subregion: 'northern-africa',
    name: {
      en: 'Sudan',
      tr: 'Sudan',
    },
  },
  {
    code: 'SE',
    m49Code: '752',
    region: 'europe',
    subregion: 'northern-europe',
    name: {
      en: 'Sweden',
      tr: 'İsveç',
    },
  },
  {
    code: 'SG',
    m49Code: '702',
    region: 'asia',
    subregion: 'south-eastern-asia',
    name: {
      en: 'Singapore',
      tr: 'Singapur',
    },
  },
  {
    code: 'SH',
    m49Code: '654',
    region: 'africa',
    subregion: 'western-africa',
    name: {
      en: 'St. Helena',
      tr: 'Saint Helena',
    },
  },
  {
    code: 'SI',
    m49Code: '705',
    region: 'europe',
    subregion: 'southern-europe',
    name: {
      en: 'Slovenia',
      tr: 'Slovenya',
    },
  },
  {
    code: 'SJ',
    m49Code: '744',
    region: 'europe',
    subregion: 'northern-europe',
    name: {
      en: 'Svalbard & Jan Mayen',
      tr: 'Svalbard ve Jan Mayen',
    },
  },
  {
    code: 'SK',
    m49Code: '703',
    region: 'europe',
    subregion: 'eastern-europe',
    name: {
      en: 'Slovakia',
      tr: 'Slovakya',
    },
  },
  {
    code: 'SL',
    m49Code: '694',
    region: 'africa',
    subregion: 'western-africa',
    name: {
      en: 'Sierra Leone',
      tr: 'Sierra Leone',
    },
  },
  {
    code: 'SM',
    m49Code: '674',
    region: 'europe',
    subregion: 'southern-europe',
    name: {
      en: 'San Marino',
      tr: 'San Marino',
    },
  },
  {
    code: 'SN',
    m49Code: '686',
    region: 'africa',
    subregion: 'western-africa',
    name: {
      en: 'Senegal',
      tr: 'Senegal',
    },
  },
  {
    code: 'SO',
    m49Code: '706',
    region: 'africa',
    subregion: 'eastern-africa',
    name: {
      en: 'Somalia',
      tr: 'Somali',
    },
  },
  {
    code: 'SR',
    m49Code: '740',
    region: 'latin-america-caribbean',
    subregion: 'south-america',
    name: {
      en: 'Suriname',
      tr: 'Surinam',
    },
  },
  {
    code: 'SS',
    m49Code: '728',
    region: 'africa',
    subregion: 'eastern-africa',
    name: {
      en: 'South Sudan',
      tr: 'Güney Sudan',
    },
  },
  {
    code: 'ST',
    m49Code: '678',
    region: 'africa',
    subregion: 'middle-africa',
    name: {
      en: 'São Tomé & Príncipe',
      tr: 'Sao Tome ve Principe',
    },
  },
  {
    code: 'SV',
    m49Code: '222',
    region: 'latin-america-caribbean',
    subregion: 'central-america',
    name: {
      en: 'El Salvador',
      tr: 'El Salvador',
    },
  },
  {
    code: 'SX',
    m49Code: '534',
    region: 'latin-america-caribbean',
    subregion: 'caribbean',
    name: {
      en: 'Sint Maarten',
      tr: 'Sint Maarten',
    },
  },
  {
    code: 'SY',
    m49Code: '760',
    region: 'asia',
    subregion: 'western-asia',
    name: {
      en: 'Syria',
      tr: 'Suriye',
    },
  },
  {
    code: 'SZ',
    m49Code: '748',
    region: 'africa',
    subregion: 'southern-africa',
    name: {
      en: 'Eswatini',
      tr: 'Esvatini',
    },
  },
  {
    code: 'TC',
    m49Code: '796',
    region: 'latin-america-caribbean',
    subregion: 'caribbean',
    name: {
      en: 'Turks & Caicos Islands',
      tr: 'Turks ve Caicos Adaları',
    },
  },
  {
    code: 'TD',
    m49Code: '148',
    region: 'africa',
    subregion: 'middle-africa',
    name: {
      en: 'Chad',
      tr: 'Çad',
    },
  },
  {
    code: 'TF',
    m49Code: '260',
    region: 'africa',
    subregion: 'eastern-africa',
    name: {
      en: 'French Southern Territories',
      tr: 'Fransız Güney Toprakları',
    },
  },
  {
    code: 'TG',
    m49Code: '768',
    region: 'africa',
    subregion: 'western-africa',
    name: {
      en: 'Togo',
      tr: 'Togo',
    },
  },
  {
    code: 'TH',
    m49Code: '764',
    region: 'asia',
    subregion: 'south-eastern-asia',
    name: {
      en: 'Thailand',
      tr: 'Tayland',
    },
  },
  {
    code: 'TJ',
    m49Code: '762',
    region: 'asia',
    subregion: 'central-asia',
    name: {
      en: 'Tajikistan',
      tr: 'Tacikistan',
    },
  },
  {
    code: 'TK',
    m49Code: '772',
    region: 'oceania',
    subregion: 'polynesia',
    name: {
      en: 'Tokelau',
      tr: 'Tokelau',
    },
  },
  {
    code: 'TL',
    m49Code: '626',
    region: 'asia',
    subregion: 'south-eastern-asia',
    name: {
      en: 'Timor-Leste',
      tr: 'Timor-Leste',
    },
  },
  {
    code: 'TM',
    m49Code: '795',
    region: 'asia',
    subregion: 'central-asia',
    name: {
      en: 'Turkmenistan',
      tr: 'Türkmenistan',
    },
  },
  {
    code: 'TN',
    m49Code: '788',
    region: 'africa',
    subregion: 'northern-africa',
    name: {
      en: 'Tunisia',
      tr: 'Tunus',
    },
  },
  {
    code: 'TO',
    m49Code: '776',
    region: 'oceania',
    subregion: 'polynesia',
    name: {
      en: 'Tonga',
      tr: 'Tonga',
    },
  },
  {
    code: 'TR',
    m49Code: '792',
    region: 'asia',
    subregion: 'western-asia',
    name: {
      en: 'Türkiye',
      tr: 'Türkiye',
    },
  },
  {
    code: 'TT',
    m49Code: '780',
    region: 'latin-america-caribbean',
    subregion: 'caribbean',
    name: {
      en: 'Trinidad & Tobago',
      tr: 'Trinidad ve Tobago',
    },
  },
  {
    code: 'TV',
    m49Code: '798',
    region: 'oceania',
    subregion: 'polynesia',
    name: {
      en: 'Tuvalu',
      tr: 'Tuvalu',
    },
  },
  {
    code: 'TW',
    m49Code: null,
    region: 'asia',
    subregion: 'eastern-asia',
    name: {
      en: 'Taiwan',
      tr: 'Tayvan',
    },
  },
  {
    code: 'TZ',
    m49Code: '834',
    region: 'africa',
    subregion: 'eastern-africa',
    name: {
      en: 'Tanzania',
      tr: 'Tanzanya',
    },
  },
  {
    code: 'UA',
    m49Code: '804',
    region: 'europe',
    subregion: 'eastern-europe',
    name: {
      en: 'Ukraine',
      tr: 'Ukrayna',
    },
  },
  {
    code: 'UG',
    m49Code: '800',
    region: 'africa',
    subregion: 'eastern-africa',
    name: {
      en: 'Uganda',
      tr: 'Uganda',
    },
  },
  {
    code: 'UM',
    m49Code: '581',
    region: 'oceania',
    subregion: 'micronesia',
    name: {
      en: 'U.S. Outlying Islands',
      tr: 'ABD Küçük Harici Adaları',
    },
  },
  {
    code: 'US',
    m49Code: '840',
    region: 'northern-america',
    subregion: null,
    name: {
      en: 'United States',
      tr: 'Amerika Birleşik Devletleri',
    },
  },
  {
    code: 'UY',
    m49Code: '858',
    region: 'latin-america-caribbean',
    subregion: 'south-america',
    name: {
      en: 'Uruguay',
      tr: 'Uruguay',
    },
  },
  {
    code: 'UZ',
    m49Code: '860',
    region: 'asia',
    subregion: 'central-asia',
    name: {
      en: 'Uzbekistan',
      tr: 'Özbekistan',
    },
  },
  {
    code: 'VA',
    m49Code: '336',
    region: 'europe',
    subregion: 'southern-europe',
    name: {
      en: 'Vatican City',
      tr: 'Vatikan',
    },
  },
  {
    code: 'VC',
    m49Code: '670',
    region: 'latin-america-caribbean',
    subregion: 'caribbean',
    name: {
      en: 'St. Vincent & Grenadines',
      tr: 'Saint Vincent ve Grenadinler',
    },
  },
  {
    code: 'VE',
    m49Code: '862',
    region: 'latin-america-caribbean',
    subregion: 'south-america',
    name: {
      en: 'Venezuela',
      tr: 'Venezuela',
    },
  },
  {
    code: 'VG',
    m49Code: '092',
    region: 'latin-america-caribbean',
    subregion: 'caribbean',
    name: {
      en: 'British Virgin Islands',
      tr: 'Britanya Virjin Adaları',
    },
  },
  {
    code: 'VI',
    m49Code: '850',
    region: 'latin-america-caribbean',
    subregion: 'caribbean',
    name: {
      en: 'U.S. Virgin Islands',
      tr: 'ABD Virjin Adaları',
    },
  },
  {
    code: 'VN',
    m49Code: '704',
    region: 'asia',
    subregion: 'south-eastern-asia',
    name: {
      en: 'Vietnam',
      tr: 'Vietnam',
    },
  },
  {
    code: 'VU',
    m49Code: '548',
    region: 'oceania',
    subregion: 'melanesia',
    name: {
      en: 'Vanuatu',
      tr: 'Vanuatu',
    },
  },
  {
    code: 'WF',
    m49Code: '876',
    region: 'oceania',
    subregion: 'polynesia',
    name: {
      en: 'Wallis & Futuna',
      tr: 'Wallis ve Futuna',
    },
  },
  {
    code: 'WS',
    m49Code: '882',
    region: 'oceania',
    subregion: 'polynesia',
    name: {
      en: 'Samoa',
      tr: 'Samoa',
    },
  },
  {
    code: 'XK',
    m49Code: null,
    region: 'europe',
    subregion: 'southern-europe',
    name: {
      en: 'Kosovo',
      tr: 'Kosova',
    },
  },
  {
    code: 'YE',
    m49Code: '887',
    region: 'asia',
    subregion: 'western-asia',
    name: {
      en: 'Yemen',
      tr: 'Yemen',
    },
  },
  {
    code: 'YT',
    m49Code: '175',
    region: 'africa',
    subregion: 'eastern-africa',
    name: {
      en: 'Mayotte',
      tr: 'Mayotte',
    },
  },
  {
    code: 'ZA',
    m49Code: '710',
    region: 'africa',
    subregion: 'southern-africa',
    name: {
      en: 'South Africa',
      tr: 'Güney Afrika',
    },
  },
  {
    code: 'ZM',
    m49Code: '894',
    region: 'africa',
    subregion: 'eastern-africa',
    name: {
      en: 'Zambia',
      tr: 'Zambiya',
    },
  },
  {
    code: 'ZW',
    m49Code: '716',
    region: 'africa',
    subregion: 'eastern-africa',
    name: {
      en: 'Zimbabwe',
      tr: 'Zimbabve',
    },
  },
]

export const COUNTRY_SETS_2026_09: CountrySetSeed[] = [
  {
    slug: 'eu27',
    label: 'EU member states',
    description: 'The 27 member states of the European Union.',
    countries: [
      'AT',
      'BE',
      'BG',
      'CY',
      'CZ',
      'DE',
      'DK',
      'EE',
      'ES',
      'FI',
      'FR',
      'GR',
      'HR',
      'HU',
      'IE',
      'IT',
      'LT',
      'LU',
      'LV',
      'MT',
      'NL',
      'PL',
      'PT',
      'RO',
      'SE',
      'SI',
      'SK',
    ],
    sourceUrl: 'https://european-union.europa.eu/principles-countries-history/eu-countries_en',
    lastVerifiedAt: '2026-09-27',
    verificationNote:
      'Checked on 2026-09-27 against the EU country list (27 countries). Greece is GR here (the EU itself writes EL).',
  },
  {
    slug: 'horizon-europe-associated',
    label: 'Countries associated to Horizon Europe',
    description:
      'Countries associated to the whole of Horizon Europe: organisations there take part on the same terms as those in EU member states. EU member states are not included.',
    countries: [
      'AL',
      'AM',
      'BA',
      'CH',
      'EG',
      'FO',
      'GB',
      'GE',
      'IL',
      'IS',
      'MD',
      'ME',
      'MK',
      'NO',
      'RS',
      'TN',
      'TR',
      'UA',
      'XK',
    ],
    sourceUrl:
      'https://ec.europa.eu/info/funding-tenders/opportunities/docs/2021-2027/common/guidance/list-3rd-country-participation_horizon-euratom_en.pdf',
    lastVerifiedAt: '2026-09-27',
    verificationNote:
      'Checked on 2026-09-27 against "EU Grants: List of participating countries (HE)", version 4.1 of 16.09.2026. Left out on purpose: Canada, Japan, New Zealand and the Republic of Korea, which are associated to Pillar II (Global Challenges and European Industrial Competitiveness) only; Morocco, whose association is still being processed (transitional arrangements). Switzerland and Egypt are associated from budget year 2025, the United Kingdom from 2024 (except the EIC Fund).',
  },
  {
    slug: 'embc-members',
    label: 'EMBC member states',
    description:
      'Member states of the European Molecular Biology Conference (EMBC), which funds EMBO programmes.',
    countries: [
      'AT',
      'BE',
      'BG',
      'CH',
      'CZ',
      'DE',
      'DK',
      'EE',
      'ES',
      'FI',
      'FR',
      'GB',
      'GR',
      'HR',
      'HU',
      'IE',
      'IL',
      'IS',
      'IT',
      'LT',
      'LU',
      'LV',
      'ME',
      'MT',
      'NL',
      'NO',
      'PL',
      'PT',
      'SE',
      'SI',
      'SK',
      'TR',
    ],
    sourceUrl: 'https://www.embo.org/about-embo/embc/',
    lastVerifiedAt: '2026-09-27',
    verificationNote:
      "Checked on 2026-09-27 against the EMBO page on the EMBC (32 member states). Left out on purpose: the associate member states India, Singapore and Taiwan, and the global partners Chile and Japan; check each programme's own rules for them.",
  },
  {
    slug: 'world-bank-lmic',
    label: 'Low- and middle-income economies (World Bank)',
    description:
      'Economies the World Bank classifies as low income, lower-middle income or upper-middle income.',
    countries: [
      'AF',
      'AL',
      'AM',
      'AO',
      'AR',
      'AZ',
      'BA',
      'BD',
      'BF',
      'BI',
      'BJ',
      'BO',
      'BR',
      'BT',
      'BW',
      'BY',
      'BZ',
      'CD',
      'CF',
      'CG',
      'CI',
      'CM',
      'CN',
      'CO',
      'CU',
      'CV',
      'DJ',
      'DM',
      'DO',
      'DZ',
      'EC',
      'EG',
      'ER',
      'ET',
      'FJ',
      'FM',
      'GA',
      'GD',
      'GE',
      'GH',
      'GM',
      'GN',
      'GQ',
      'GT',
      'GW',
      'HN',
      'HT',
      'ID',
      'IN',
      'IQ',
      'IR',
      'JM',
      'JO',
      'KE',
      'KG',
      'KH',
      'KI',
      'KM',
      'KP',
      'KZ',
      'LA',
      'LB',
      'LC',
      'LK',
      'LR',
      'LS',
      'LY',
      'MA',
      'MD',
      'ME',
      'MG',
      'MH',
      'MK',
      'ML',
      'MM',
      'MN',
      'MR',
      'MU',
      'MV',
      'MW',
      'MX',
      'MY',
      'MZ',
      'NA',
      'NE',
      'NG',
      'NI',
      'NP',
      'PE',
      'PG',
      'PH',
      'PK',
      'PS',
      'PY',
      'RS',
      'RW',
      'SB',
      'SD',
      'SL',
      'SN',
      'SO',
      'SR',
      'SS',
      'ST',
      'SV',
      'SY',
      'SZ',
      'TD',
      'TG',
      'TH',
      'TJ',
      'TL',
      'TM',
      'TN',
      'TO',
      'TR',
      'TV',
      'TZ',
      'UA',
      'UG',
      'UZ',
      'VC',
      'VE',
      'VN',
      'VU',
      'WS',
      'XK',
      'YE',
      'ZA',
      'ZM',
      'ZW',
    ],
    sourceUrl: 'https://datahelpdesk.worldbank.org/knowledgebase/articles/906519',
    lastVerifiedAt: '2026-09-27',
    verificationNote:
      'Checked on 2026-09-27 against the World Bank classification for fiscal year 2027 (1 July 2026 to 30 June 2027), also in the World Bank API: 25 low income, 47 lower-middle income and 59 upper-middle income economies. The World Bank updates the groups every 1 July.',
  },
]
