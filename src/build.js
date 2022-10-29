import * as fs from 'node:fs/promises';
import {XMLParser} from 'fast-xml-parser';

const INCLUDE_NAMELESS = false;

// Map of iNES mapper number to RetroBlaster mapper type.
const inesMapperTypeMap = new Map(Object.entries({
  'NROM': [1],
  'CNROM': [3,185],
  'UxROM': [2,94,180],
  'AxROM': [7],
  'MMC1': [1,105,155],
  'MMC2': [9],
  'MMC3': [4,118,119],
  'MMC4': [10],
  'MMC5': [5],
  'ColorDreams/Wisdom Tree': [11],
  'Camerica': [71],
  'BNROM': [34],
  'GNROM/MHROM': [66],
  'Mapper 206': [206,76,88,154,95],
}).flatMap(([type, inesMappers]) =>
  inesMappers.map(inesMapper =>
    [inesMapper.toString(), type]
  )
));

const xmlParser = new XMLParser({ignoreAttributes: false});

// Read and parse nointro XML.
const nointroXMLStr = await fs.readFile(
  new URL('../lib/Nintendo - Nintendo Entertainment System (Headerless) (20221029-071237).dat', import.meta.url),
  'utf8'
);

/** @type {NoIntro} */
const nointroXML = xmlParser.parse(nointroXMLStr);

// Map of ROM headerless CRC hash to ROM name.
/** @type {Map<string, string>} */
const crcFilenameMap = new Map();
for (const game of nointroXML.datafile.game) {
  const romCRC = game.rom['@_crc']?.toUpperCase();
  if (!romCRC) continue;
  
  crcFilenameMap.set(romCRC, game.rom['@_name']);
}

// Read and parse nointro XML.
const nes2DBXMLStr = await fs.readFile(
  new URL('../lib/nes20db.xml', import.meta.url),
  'utf8'
);

/** @type {NES2DB} */
const nes2DBXML = xmlParser.parse(nes2DBXMLStr);

// Generate lookup entires.
/** {@type {LookupEntry[]} */
const lookupEntires = [];
for (const game of nes2DBXML.nes20db.game) {
  const romCRC = game.rom['@_crc32']?.toUpperCase();
  if (!romCRC) continue;
  
  const name = crcFilenameMap.get(romCRC);
  if (!name && !INCLUDE_NAMELESS) continue;
  
  lookupEntires.push({
    romCRC,
    name,
    mapperType: inesMapperTypeMap.get(game.pcb['@_mapper']),
    prgROMSizeKB: game.prgrom? (parseInt(game.prgrom['@_size'], 10) / 1024) : undefined,
    chrROMSizeKB: game.chrrom? (parseInt(game.chrrom['@_size'], 10) / 1024) : undefined,
    mirroring: game.pcb['@_mirroring'],
    usesBattery: game.pcb['@_battery'] === '1',
  });
}

lookupEntires.sort((a, b) =>
  // @ts-ignore
  (!a.name - !b.name) || (a.name? a.name.localeCompare(b.name) : 0)
);

// Generate HTML.
const templateHTML = await fs.readFile(
  new URL('./nesMapperLookup.html', import.meta.url),
  'utf8'
);

let lookupHTML = templateHTML.replace('__LOOKUP_ENTIRES__', JSON.stringify(lookupEntires));
lookupHTML = `<!-- DO NOT EDIT - AUTO GENERATED -->\n` + lookupHTML;

await fs.writeFile(
  new URL('../dist/nesMapperLookup.html', import.meta.url),
  lookupHTML,
  'utf8'
);

/**
@typedef {{
  datafile: {
    game: {
      description: string;
      '@_name': string;
      rom: {
        '@_name': string;
        '@_size': string;
        '@_crc': string;
        '@_md5': string;
        '@_sha1': string;
        '@_sha256': string;
        '@_status': string;
      };
    }[];
  }
}} NoIntro

@typedef {{
  nes20db: {
    game: {
      rom: {
        '@_size': string;
        '@_crc32': string;
        '@_sha1': string;
      };
      prgrom?: {
        '@_size': string;
        '@_crc32': string;
        '@_sha1': string;
        '@_sum16': string;
      };
      chrrom?: {
        '@_size': string;
        '@_crc32': string;
        '@_sha1': string;
        '@_sum16': string;
      };
      miscrom?: {
        '@_size': string;
        '@_crc32': string;
        '@_sha1': string;
        '@_number': string;
      };
      trainer?: {
        '@_size': string;
        '@_crc32': string;
        '@_sha1': string;
      };
      prgram?: {
        '@_size': string;
      };
      prgnvram?: {
        '@_size': string;
      };
      chrram?: {
        '@_size': string;
      };
      chrnvram?: {
        '@_size': string;
      };
      pcb: {
        '@_mapper': string;
        '@_submapper': string;
        '@_mirroring': string;
        '@_battery': string;
      };
      console?: {
        '@_type': string;
        '@_region': string;
      };
      expansion?: {
        '@_type': string;
      };
      vs?: {
        '@_hardware': string;
        '@_ppu': string;
      };
    }[];
  };
}} NES2DB

@typedef {{
  romCRC: string;
  name?: string;
  mapperType?: string;
  prgROMSizeKB?: number;
  chrROMSizeKB?: number;
  mirroring?: string;
  usesBattery: boolean;
}} LookupEntry
*/