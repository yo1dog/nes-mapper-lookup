import * as fs from 'node:fs/promises';
import {XMLParser} from 'fast-xml-parser';

const IGNORE_NAMELESS = true;
/** @type {RegExp[]} */
const IGNORE_NES2DB_NAME_REGEXP = [
  /^Bootleg Singles\\/,
  /^Bootleg Hacks\\/,
  /^Homebrew\\/,
  /^Compatibility Hacks\\/,
  /^Modern\\/,
  /^Bad Dumps\\/,
  /^BIOS\\/,
];
/** @type {RegExp[]} */
const IGNORE_NOINTRO_NAME_REGEXP = [
  /\(Virtual Console\)/
];
/** @type {string[]} */
const IGNORE_ROM_CRC32 = [
];

// Map of iNES mapper number to RetroBlaster mapper type.
const inesMapperTypeMap = new Map(Object.entries({
  'NROM': [0],
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

const xmlParser = new XMLParser({ignoreAttributes: false, commentPropName: '_comment', attributeNamePrefix: ''});

// Read and parse nointro XML.
const nointroXMLStr = await fs.readFile(
  new URL('../lib/Nintendo - Nintendo Entertainment System (Headerless) (20221029-071237).dat', import.meta.url),
  'utf8'
);
/** @type {NoIntro} */
const nointroXML = xmlParser.parse(nointroXMLStr);

// Read and parse NES2.0 DB XML.
const nes2DBXMLStr = await fs.readFile(
  new URL('../lib/nes20db.xml', import.meta.url),
  'utf8'
);
/** @type {NES2DB} */
const nes2DBXML = xmlParser.parse(nes2DBXMLStr);

// Map CRC32 to No-Intro game.
const noIntroGameMap = new Map();
for (const noIntroGame of nointroXML.datafile.game) {
  if (!noIntroGame.rom.crc) continue;
  noIntroGameMap.set(noIntroGame.rom.crc.toUpperCase(), noIntroGame);
}

// Generate lookup entires.
/** {@type {LookupEntry[]} */
const lookupEntires = [];
for (const game of nes2DBXML.nes20db.game) {
  const romCRC32 = game.rom.crc32?.toUpperCase();
  if (!romCRC32) continue;
  
  const noIntroName = noIntroGameMap.get(romCRC32)?.name;
  
  if (shouldIgnoreGame(
    game._comment.trim(),
    noIntroName,
    romCRC32,
  )) {
    continue;
  }
  
  lookupEntires.push({
    romCRC32,
    name: noIntroName,
    mapperType: inesMapperTypeMap.get(game.pcb.mapper),
    prgROMSizeKB: game.prgrom? (parseIntStrict(game.prgrom.size) / 1024) : undefined,
    chrROMSizeKB: game.chrrom? (parseIntStrict(game.chrrom.size) / 1024) : undefined,
    mirroring: game.pcb.mirroring,
    usesBattery: parseBoolStrict(game.pcb.battery),
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
 * @param {string} nes2Name 
 * @param {string | undefined} noIntroName 
 * @param {string} romCRC32 
 * @returns 
 */
function shouldIgnoreGame(nes2Name, noIntroName, romCRC32) {
  for (const regexp of IGNORE_NES2DB_NAME_REGEXP) {
    if (regexp.test(nes2Name)) {
      return true;
    }
  }
  
  if (noIntroName) {
    for (const regexp of IGNORE_NOINTRO_NAME_REGEXP) {
      if (regexp.test(noIntroName)) {
        return true;
      }
    }
  }
  else if (IGNORE_NAMELESS) {
    return true;
  }
  
  for (const iRomCRC32 of IGNORE_ROM_CRC32) {
    if (romCRC32 === iRomCRC32) {
      return true;
    }
  }
  
  return false;
}

/** @param {string} str */
function parseIntStrict(str) {
  if (!/^\d+$/.test(str)) throw new Error(`Invalid integer: ${str}`);
  return parseInt(str, 10);
}
/** @param {string} str */
function parseBoolStrict(str) {
  if (str === '0') return false;
  if (str === '1') return true;
  throw new Error(`Invalid boolean: ${str}`);
}

/**
@typedef {{
  datafile: {
    game: {
      description: string;
      name: string;
      rom: {
        name: string;
        size: string;
        crc: string;
        md5: string;
        sha1: string;
        sha256: string;
        status: string;
      };
    }[];
  }
}} NoIntro

@typedef {{
  nes20db: {
    game: {
      _comment: string;
      rom: {
        size: string;
        crc32: string;
        sha1: string;
      };
      prgrom?: {
        size: string;
        crc32: string;
        sha1: string;
        sum16: string;
      };
      chrrom?: {
        size: string;
        crc32: string;
        sha1: string;
        sum16: string;
      };
      miscrom?: {
        size: string;
        crc32: string;
        sha1: string;
        number: string;
      };
      trainer?: {
        size: string;
        crc32: string;
        sha1: string;
      };
      prgram?: {
        size: string;
      };
      prgnvram?: {
        size: string;
      };
      chrram?: {
        size: string;
      };
      chrnvram?: {
        size: string;
      };
      pcb: {
        mapper: string;
        submapper: string;
        mirroring: string;
        battery: string;
      };
      console?: {
        type: string;
        region: string;
      };
      expansion?: {
        type: string;
      };
      vs?: {
        hardware: string;
        ppu: string;
      };
    }[];
  };
}} NES2DB

@typedef {{
  romCRC32: string;
  name?: string;
  mapperType?: string;
  prgROMSizeKB?: number;
  chrROMSizeKB?: number;
  mirroring?: string;
  usesBattery: boolean;
}} LookupEntry
*/