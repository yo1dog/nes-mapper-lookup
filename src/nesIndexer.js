import * as fs from 'node:fs/promises';
import {XMLParser} from 'fast-xml-parser';
import * as pathUtil from 'path';
import crc32 from 'crc/crc32';

// eslint-disable-next-line no-process-env
const HEADERLESS_ROM_DIR = process.env.HEADERLESS_ROM_DIR;
if (!HEADERLESS_ROM_DIR) {
  console.error(`Must set HEADERLESS_ROM_DIR env var.`);
  process.exit(1);
}

/** @type {RegExp[]} */
const IGNORE_NES2DB_NAME_REGEXP = [
  // /^Bootleg Singles\\/,
  // /^Bootleg Hacks\\/,
  // /^Homebrew\\/,
  // /^Compatibility Hacks\\/,
  // /^Modern\\/,
  // /^Bad Dumps\\/,
  // /^BIOS\\/,
];
/** @type {RegExp[]} */
const IGNORE_NOINTRO_NAME_REGEXP = [
  ///\(Virtual Console\)/
];
/** @type {string[]} */
const IGNORE_ROM_CRC32 = [
  '3413E33B', // Seicross (Japan) (Virtual Console)
  'CAA76927', // Yoshi's Cookie (Europe) (Virtual Console)
  '4B6EF399', // Karaoke Studio Senyou Cassette - Top Hit 20 Vol. 1 (Japan)
  '50F3E338', // Karaoke Studio Senyou Cassette - Top Hit 20 Vol. 2 (Japan)
];

class MissingFileError extends Error {
  /**
   * @param {Game} game 
   * @param {string} filename 
   * @param {string} filepath 
   */
  constructor(game, filename, filepath) {
    super();
    this.game = game;
    this.filename = filename;
    this.filepath = filepath;
  }
}

const xmlParser = new XMLParser({ignoreAttributes: false, commentPropName: '_comment', attributeNamePrefix: ''});

console.log('Reading and parsing data files...');

// Read and parse NES2.0 DB XML.
const nes2DBXMLStr = await fs.readFile(
  new URL('../lib/nes20db.xml', import.meta.url),
  'utf8'
);
/** @type {NES2DB} */
const nes2DBXML = xmlParser.parse(nes2DBXMLStr);

// Read and parse No-Intro XML.
const nointroXMLStr = await fs.readFile(
  new URL('../lib/Nintendo - Nintendo Entertainment System (Headerless) (20221029-071237).dat', import.meta.url),
  'utf8'
);
/** @type {NoIntro} */
const nointroXML = xmlParser.parse(nointroXMLStr);

// Combine and parse game information.
let numNES2HeaderDataMissing = 0;
let numIgnored = 0;

// Map CRC32 to NES2.0 game.
const nes2DBGameMap = new Map();
for (const nes2DBGame of nes2DBXML.nes20db.game) {
  if (!nes2DBGame.rom.crc32) continue;
  nes2DBGameMap.set(nes2DBGame.rom.crc32.toUpperCase(), nes2DBGame);
}

/** @type {Game[]} */
const games = [];
for (const nointroGame of nointroXML.datafile.game) {
  const romCRC32 = nointroGame.rom.crc?.toUpperCase();
  
  if (!romCRC32) {
    console.log(`00000000 ${nointroGame.name} - CRC32 missing.`);
    continue;
  }
  
  const nes2DBGame = nes2DBGameMap.get(romCRC32);
  if (!nes2DBGame) {
    //console.log(`${romCRC32} ${nointroGame.name} - NES2.0 header data missing.`);
    ++numNES2HeaderDataMissing;
    continue;
  }
  
  if (shouldIgnoreGame(
    nes2DBGame._comment.trim(),
    nointroGame.name,
    romCRC32
  )) {
    //console.log(`${romCRC32} ${nointroGame.name} - Ignoring.`);
    ++numIgnored;
    continue;
  }
  
  const prgROMSizeBytes = nes2DBGame.prgrom? parseIntStrict(nes2DBGame.prgrom.size) : undefined;
  if (!prgROMSizeBytes) {
    console.log(`${romCRC32} ${nointroGame.name} - Missing PRG ROM size.`);
    continue;
  }
  
  const chrROMSizeBytes = nes2DBGame.chrrom? parseIntStrict(nes2DBGame.chrrom.size) : 0;
  
  games.push({
    romCRC32,
    name: nointroGame.name,
    filename: nointroGame.rom.name,
    prgROMSizeBytes,
    chrROMSizeBytes,
    nes2HeaderData: {
      rom: {
        size: parseIntStrict(nes2DBGame.rom.size),
        crc32: nes2DBGame.rom.crc32
      },
      pcb: {
        mapper: parseIntStrict(nes2DBGame.pcb.mapper),
        submapper: parseIntStrict(nes2DBGame.pcb.mapper),
        mirroring: nes2DBGame.pcb.mirroring,
        battery: parseBoolStrict(nes2DBGame.pcb.battery),
      },
      prgrom: {
        size: prgROMSizeBytes,
        // @ts-ignore
        crc32: nes2DBGame.prgrom.crc32
      },
      chrrom: nes2DBGame.chrrom && {
        size: chrROMSizeBytes,
        crc32: nes2DBGame.chrrom.crc32,
      },
      miscrom: nes2DBGame.miscrom && {
        size: parseIntStrict(nes2DBGame.miscrom.size),
        crc32: nes2DBGame.miscrom.crc32,
        number: parseIntStrict(nes2DBGame.miscrom.number)
      },
      trainer: nes2DBGame.trainer && {
        size: parseIntStrict(nes2DBGame.trainer.size),
        crc32: nes2DBGame.trainer.crc32,
      },
      prgram: nes2DBGame.prgram && {
        size: parseIntStrict(nes2DBGame.prgram.size)
      },
      prgnvram: nes2DBGame.prgnvram && {
        size: parseIntStrict(nes2DBGame.prgnvram.size)
      },
      chrram: nes2DBGame.chrram && {
        size: parseIntStrict(nes2DBGame.chrram.size)
      },
      chrnvram: nes2DBGame.chrnvram && {
        size: parseIntStrict(nes2DBGame.chrnvram.size)
      },
      console: nes2DBGame.console && {
        type: nes2DBGame.console.type,
        region: nes2DBGame.console.region
      },
      expansion: nes2DBGame.expansion && {
        type: nes2DBGame.expansion.type
      },
      vs: nes2DBGame.vs && {
        hardware: nes2DBGame.vs.hardware,
        ppu: nes2DBGame.vs.ppu
      }
    }
  });
}

console.log(`Including ${games.length}/${nointroXML.datafile.game.length}`);
console.log(`${numNES2HeaderDataMissing} missing NES2.0 header data`);
console.log(`${numIgnored} ignored`);
console.log(`${nointroXML.datafile.game.length - games.length - numNES2HeaderDataMissing - numIgnored} other`);

// Create index tree.
/** @type {IndexBranch} */
const indexTrunk = {
  prgROMByteLength: 512,
  chrROMByteLength: 0,
  leafDict: {},
  branchDict: {},
};

// IMPORTANT: Sort games by size so we don't have to worry about overreading files or subdividing
// branches.
games.sort((a, b) => (
  (a.prgROMSizeBytes - b.prgROMSizeBytes) ||
  (a.chrROMSizeBytes - b.chrROMSizeBytes)
));

/** @type {MissingFileError[]} */
const missingFileErrors = [];

console.log('Building index...');
for (let i = 0; i < games.length; ++i) {
  const game = games[i];
  
  //console.log(`${game.romCRC32} ${i + 1}/${games.length} ${game.name}`);
  try {
    await addGameToBranch(indexTrunk, game);
  } catch (err) {
    if (err instanceof MissingFileError) {
      missingFileErrors.push(err);
    }
  }
}

console.log('Done building.');

// Report missing files.
if (missingFileErrors.length > 0) {
  console.log(`Missing files: ${missingFileErrors.length}`);
  for (const missingFileError of missingFileErrors) {
    console.log(`${missingFileError.game.romCRC32} ${missingFileError.filename}`);
  }
}

// Find and report ambigous games.
/** @type {{crc32PartialHash: string; leaf: IndexLeaf}[]} */
const ambiguities = [];
let numAmbiguousGames = 0;
itterateIndex(indexTrunk, branch => {
  for (const crc32PartialHash in branch.leafDict) {
    const leaf = branch.leafDict[crc32PartialHash];
    if (leaf.games.length > 1) {
      ambiguities.push({crc32PartialHash, leaf});
      numAmbiguousGames += leaf.games.length;
    }
  }
});

if (ambiguities.length > 0) {
  console.log(`Failed to differentiate: ${numAmbiguousGames}`);
  for (const {crc32PartialHash, leaf} of ambiguities) {
    console.log(`${crc32PartialHash} PRG:${leaf.prgROMSizeBytes} CHR:${leaf.chrROMSizeBytes}`);
    for (let i = 0; i < leaf.games.length; ++i) {
      const game = leaf.games[i];
      console.log(`  ${i === leaf.games.length - 1? '└' : '├'}─ ${game.romCRC32} ${game.name} - PRG:${game.prgROMSizeBytes} CHR:${game.chrROMSizeBytes}`);
    }
  }
}

console.log(`Indexed ${games.length - missingFileErrors.length - numAmbiguousGames}/${games.length}`);
console.log(`${missingFileErrors.length} files missing`);
console.log(`${numAmbiguousGames} ambiguous`);

// Generate JSON
await fs.writeFile(
  new URL('../dist/nesIndex.json', import.meta.url),
  JSON.stringify(serializeIndexBranch(indexTrunk)),
  'utf8'
);


/**
 * @param {Game} game 
 * @param {number} byteLength 
 */
async function createPartialCRC32Hash(game, byteLength) {
  const filename = game.filename.slice(0, -4) + '.unh';
  const filepath = pathUtil.join(
    /**@type {string}*/(HEADERLESS_ROM_DIR),
    filename
  );
  
  let romFile;
  try {
    try {
      romFile = await fs.open(filepath);
    } catch(err) {
      if (/**@type {{code?: string}}*/(err).code === 'ENOENT') {
        throw new MissingFileError(game, filename, filepath);
      }
      throw err;
    }
    
    const result = await romFile.read({buffer: Buffer.alloc(byteLength), length: byteLength});
    if (result.bytesRead !== byteLength) {
      throw new Error(`Read incorrect byte length: ${result.bytesRead} instead of ${byteLength}`);
    }
    return crc32(result.buffer).toString(16).padStart(8, '0').toUpperCase();
  }
  finally {
    romFile?.close();
  }
}

/**
 * @param {IndexBranch} branch 
 * @param {Game} game 
 */
async function addGameToBranch(branch, game) {
  // NOTE: Because we sort games by size, we don't have to worry about reading past the end of a
  // file. That is, because we process the smallest games first, subsequent games will always be
  // the same size as or larger than all existing branch byte lengths.
  const crc32PartialHash = await createPartialCRC32Hash(game, branch.prgROMByteLength + branch.chrROMByteLength);
  
  const childBranch = branch.branchDict[crc32PartialHash];
  if (childBranch) {
    await addGameToBranch(childBranch, game);
    return;
  }
  
  const leaf = branch.leafDict[crc32PartialHash];
  if (leaf) {
    // There is a hash collision. Calculate a larger seekable range to differentiate.
    // The largest safe seekable range is the smallest size of the two ROMs.
    const newPRGROMByteLength = Math.min(game.prgROMSizeBytes, leaf.prgROMSizeBytes);
    const newCHRROMByteLength = (
      // Only start reading from CHR ROM once we have exhausted the PRG ROM.
      newPRGROMByteLength === branch.prgROMByteLength
      ? Math.min(game.chrROMSizeBytes, leaf.chrROMSizeBytes)
      : 0
    );
    
    // If the new range is the same as the current range, then one or both of the games have been
    // hashed completely and cannot be differentiated. This happens when the two games are identical
    // or if one game contains the entirety of the other game at its start. For example:
    // 60cd91faf695d24c vs 60cd91faf695d24c - Hash of first 8 bytes would be identical.
    // 60cd91faf695d24c vs 60cd91faf695d24c330ff22f1aadd785 - Hash of first 8 bytes would still be identical.
    if (
      newPRGROMByteLength === branch.prgROMByteLength &&
      newCHRROMByteLength === branch.chrROMByteLength
    ) {
      // Games are ambiguous. Add the game to the leaf.
      leaf.games.push(game);
      return;
    }
    
    // Convert the leaf into a child branch.
    delete branch.leafDict[crc32PartialHash];
    const newBranch = branch.branchDict[crc32PartialHash] = {
      prgROMByteLength: newPRGROMByteLength,
      chrROMByteLength: newCHRROMByteLength,
      leafDict: {},
      branchDict: {}
    };
    
    // NOTE: A leaf containing ambiguous games will never reach this point so we know the leaf only
    // contains 1 game.
    await addGameToBranch(newBranch, leaf.games[0]);
    await addGameToBranch(newBranch, game);
    return;
  }
  
  branch.leafDict[crc32PartialHash] = {
    prgROMSizeBytes: game.prgROMSizeBytes,
    chrROMSizeBytes: game.chrROMSizeBytes,
    games: [game]
  };
}

/** @param {IndexBranch} branch */
function serializeIndexBranch(branch) {
  const sbranch = {
    prgROMByteLength: branch.prgROMByteLength,
    chrROMByteLength: branch.chrROMByteLength,
    leafDict: {},
    branchDict: {},
  };
  
  for (const k in branch.leafDict) {
    const games = branch.leafDict[k].games;
    if (games.length > 1) {
      // Skip ambigious games.
      continue;
    }
    
    const game = games[0];
    // @ts-ignore
    sbranch.leafDict[k] = {
      romCRC32: game.romCRC32,
      name: game.name,
      filename: game.filename,
      nes2HeaderData: game.nes2HeaderData,
    };
  }
  
  for (const k in branch.branchDict) {
    // @ts-ignore
    sbranch.branchDict[k] = serializeIndexBranch(branch.branchDict[k]);
  }
  
  return sbranch;
}

/**
 * @param {string} nes2Name 
 * @param {string} nointroName 
 * @param {string} romCRC32 
 * @returns 
 */
function shouldIgnoreGame(nes2Name, nointroName, romCRC32) {
  for (const regexp of IGNORE_NES2DB_NAME_REGEXP) {
    if (regexp.test(nes2Name)) {
      return true;
    }
  }
  for (const regexp of IGNORE_NOINTRO_NAME_REGEXP) {
    if (regexp.test(nointroName)) {
      return true;
    }
  }
  for (const iRomCRC32 of IGNORE_ROM_CRC32) {
    if (romCRC32 === iRomCRC32) {
      return true;
    }
  }
  return false;
}

/**
 * @param {IndexBranch} branch
 * @param {(branch: IndexBranch) => void} cb
 */
function itterateIndex(branch, cb) {
  cb(branch); // eslint-disable-line callback-return
  for (const k in branch.branchDict) {
    itterateIndex(branch.branchDict[k], cb);
  }
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
  prgROMSizeBytes: number;
  chrROMSizeBytes: number;
  name: string;
  filename: string;
  nes2HeaderData: {
    rom: {
      size: number;
      crc32: string;
    };
    pcb: {
      mapper: number;
      submapper: number;
      mirroring: string;
      battery: boolean;
    };
    prgrom: {
      size: number;
      crc32: string;
    };
    chrrom?: {
      size: number;
      crc32: string;
    };
    miscrom?: {
      size: number;
      crc32: string;
      number: number;
    };
    trainer?: {
      size: number;
      crc32: string;
    };
    prgram?: {
      size: number;
    };
    prgnvram?: {
      size: number;
    };
    chrram?: {
      size: number;
    };
    chrnvram?: {
      size: number;
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
  }
}} Game

@typedef {{
  mupperIndex: number;
  prgROMSizeBytes: number;
  chrROMSizeBytes: number;
}} DumpParamSet

@typedef {{
  prgROMByteLength: number;
  chrROMByteLength: number;
  leafDict: {[crc: string]: IndexLeaf};
  branchDict: {[crc: string]: IndexBranch};
}} IndexBranch

@typedef {{
  prgROMSizeBytes: number;
  chrROMSizeBytes: number;
  games: Game[];
}} IndexLeaf

*/
