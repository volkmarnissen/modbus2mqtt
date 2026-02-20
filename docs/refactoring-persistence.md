# Persistence Layer Refactoring Plan

## Context

The three static classes `Config`, `ConfigBus`, and `ConfigSpecification` currently mix in-memory state management with filesystem I/O. Goal: Extract persistence logic into dedicated classes, introduce a generic in-memory store.

**Risk minimization**: Only extract read/write. Business logic, events, and public API remain unchanged as much as possible.

### Already Completed (before this refactoring)

- **JSON single-file format**: Specifications are stored as single `.json` files with base64-embedded files (no separate `files.yaml` or binary files). Migrator handles YAML -> JSON conversion on read.
- **Base64 files**: `IimageAndDocumentUrl` has `data` (base64) and `mimeType` fields. Upload endpoints removed, frontend uses `FileReader.readAsDataURL()`.
- **Status as JSON attribute**: Status (`added`, `cloned`, `contributed`) is persisted in the JSON file. `readYaml()` is a pure reader — no status derivation logic. For legacy YAML specs, the Migrator derives status from `publicNames`.
- **Two directories only**: `public/specifications/` (read-only, from GitHub) and `local/specifications/` (all local specs). No `contributed/` directory.
- **Spec Export/Import als JSON**: Zip-basierter Export/Import durch JSON ersetzt. `configspec.ts` ist fs-frei. `multer`/`zipStorage` aus httpserver.ts entfernt.

### Completed (this refactoring, Steps 0–5 + Cleanup)

- **Steps 0–5**: Persistence-Klassen (`ConfigPersistence`, `BusPersistence`, `SpecPersistence`), `Store<T>`, Interfaces, 40 neue Tests — alle grün (170 Tests gesamt).
- **config.ts ist fs-frei**: Alle `fs`-Aufrufe aus `config.ts` entfernt. Neue Methoden in `ConfigPersistence`: `ensureSecret()`, `readCertificateFile()`, `createLocalExportZip()`.
- **Directory-Properties auf ConfigPersistence**: `configDir`, `sslDir`, `dataDir` und `getLocalDir()` sind jetzt static auf `ConfigPersistence` (vorher auf `Config`). Alle 13+ Dateien (Source + Tests) entsprechend aktualisiert.
- **config.ts kennt keine Dateipfade mehr**: Kein `fs`, kein `path` (außer `join` für URL-Konstruktion in `getSpecificationImageOrDocumentUrl`), kein `stream`, kein `AdmZip`.

---

## Step 0: Safety Tests BEFORE Refactoring

### Architecture After Refactoring

```
Startup (modbus2mqtt.ts):
  ConfigPersistence.read()  -> Iconfiguration        -> Config receives data
  BusPersistence.readAll()  -> Store<IBus>            -> ConfigBus receives Store
  SpecPersistence.readAll() -> Store<IfileSpec>       -> ConfigSpecification receives Store
```

Business classes no longer know about the filesystem. Persistence classes have no business logic.

### Test Strategy: Two Levels

**Level 1: Persistence Contract Tests** (directly reusable after refactoring)
- Test the mapping: Filesystem <-> data structures
- Before refactoring: invoked through the business classes
- After refactoring: invoked directly through persistence classes
- **Assertions remain identical**, only the "Act" call changes

**Level 2: Business Logic Tests** (independent of persistence)
- Test behavior with an already populated store
- After refactoring: Store is populated directly in the test, no filesystem needed

### Test Infrastructure
Existing: `TempConfigDirHelper`, `setConfigsDirsForTest()`, `initBussesForTest()` in [testhelper.ts](../backend/tests/server/testhelper.ts) and [configsbase.ts](../backend/tests/server/configsbase.ts).

---

### 0a. Config Persistence Contract (`backend/tests/server/config_persistence_test.tsx`)

These tests document the filesystem contract. After refactoring they become `ConfigPersistence` tests.

| # | Test (Given -> When -> Then) | What is secured |
|---|---|---|
| 1 | **Given** modbus2mqtt.yaml + secrets.yaml on disk -> **When** read -> **Then** Iconfiguration has correct values including decrypted secrets | Read contract |
| 2 | **Given** Iconfiguration with secrets -> **When** write -> **Then** modbus2mqtt.yaml has `!secret` placeholders, secrets.yaml has plaintext secrets | Write contract |
| 3 | **Given** write(config) -> **When** read -> **Then** identical values (round-trip) | Write/Read consistency |
| 4 | **Given** no secrets.txt -> **When** getSecret -> **Then** secrets.txt created, 256 characters | Secret generation |
| 5 | **Given** secrets.txt exists -> **When** getSecret 2x -> **Then** same value | Secret stability |

### 0b. ConfigBus Persistence Contract (`backend/tests/server/configbus_persistence_test.tsx`)

| # | Test (Given -> When -> Then) | What is secured |
|---|---|---|
| 1 | **Given** busses/ with bus.0/bus.yaml + s1.yaml -> **When** readAll -> **Then** 1 bus with busId=0, 1 slave with slaveid=1 | Read contract |
| 2 | **Given** IModbusConnection -> **When** writeBus -> **Then** busses/bus.{id}/bus.yaml with correct YAML content | Write contract (bus) |
| 3 | **Given** Islave (with runtime fields) -> **When** writeSlave -> **Then** s{id}.yaml without specification, durationOfLongestModbusCall etc. | Write contract (slave) + cleanup |
| 4 | **Given** writeBus + writeSlave -> **When** readAll -> **Then** identical data | Round-trip |
| 5 | **Given** bus exists -> **When** deleteBus -> **Then** directory gone | Delete contract (bus) |
| 6 | **Given** slave exists -> **When** deleteSlave -> **Then** s{id}.yaml gone | Delete contract (slave) |

### 0c. ConfigBus Business Logic (`backend/tests/server/configbus_logic_test.tsx`)

| # | Test (Given -> When -> Then) | What is secured |
|---|---|---|
| 7 | **Given** 2 busses in store -> **When** getBussesProperties -> **Then** 2 busses | In-memory lookup |
| 8 | **Given** bus with slaves -> **When** getSlave(busId, slaveId) -> **Then** correct slave | Slave lookup |
| 9 | **Given** listener registered -> **When** addSlave/deleteSlave -> **Then** listener called | Event system |

### 0d. ConfigSpecification Persistence Contract (`backend/tests/specification/configspec_persistence_test.tsx`)

| # | Test (Given -> When -> Then) | What is secured |
|---|---|---|
| 1 | **Given** specifications/*.json in local -> **When** readAll -> **Then** correct number of specs, status from JSON | JSON read contract |
| 2 | **Given** JSON spec with base64 files -> **When** readAll -> **Then** spec.files[] with data + mimeType | Base64 files contract |
| 3 | **Given** old YAML spec in local + publicNames -> **When** readAll -> **Then** migrated to v0.5 with correct status (cloned/added) | Migrator + status contract |
| 4 | **Given** old YAML spec in public dir -> **When** readAll -> **Then** migrated to v0.5, status = published | Public spec contract |
| 5 | **Given** IfileSpecification -> **When** writeItem -> **Then** {filename}.json with correct content incl. status | Write contract (JSON) |
| 6 | **Given** writeItem -> **When** readAll -> **Then** identical spec incl. status | Round-trip |
| 7 | **Given** spec in local -> **When** deleteItem -> **Then** .json gone | Delete contract |
| 8 | **Given** mix of .json + .yaml in same dir -> **When** readAll -> **Then** both read, JSON takes precedence | Dual-format read |

### 0e. ConfigSpecification Business Logic (`backend/tests/specification/configspec_logic_test.tsx`)

| # | Test (Given -> When -> Then) | What is secured |
|---|---|---|
| 9 | **Given** local specs + published specs -> **When** readYaml -> **Then** publicSpecification references set correctly | Public reference linking |
| 10 | **Given** local spec with empty files + published spec with files -> **When** readYaml -> **Then** files copied from published | Files inheritance |
| 11 | **Given** specs in store -> **When** getSpecificationByFilename -> **Then** correct spec | Lookup |
| 12 | **Given** specs in store -> **When** filterAllSpecifications(fn) -> **Then** fn called for each spec | Iteration |
| 13 | **Given** spec with filename change -> **When** write -> **Then** rename logic correct | Rename |

### Test Summary: ~24 New Tests

| Area | Persistence Contract | Business Logic | Total |
|------|---------------------|----------------|-------|
| Config | 5 | - | 5 |
| ConfigBus | 6 | 3 | 9 |
| ConfigSpecification | 8 | 5 | 13 |
| **Total** | **19** | **8** | **27** |

---

## Step 1: Store + Persistence Interfaces

**New files in `backend/src/server/persistence/`:**

### `store.ts` - Generic In-Memory Store

```typescript
export class Store<T> {
  private items = new Map<string, T>()

  get(key: string): T | undefined        // structuredClone
  add(key: string, item: T): void        // throws if exists
  update(key: string, item: T): void     // throws if not found
  delete(key: string): boolean
  list(filter?: (item: T) => boolean): T[]  // structuredClone
  getRef(key: string): T | undefined     // direct reference (internal use)
  listRefs(filter?): T[]                 // direct references
  has(key: string): boolean
  clear(): void
  keys(): string[]
}
```

### `persistence.ts` - Interfaces

```typescript
export interface ISingletonPersistence<T> {
  read(): Promise<T | undefined>
  write(item: T): void
}

export interface ICollectionPersistence<T> {
  readAll(): T[]
  writeItem(key: string, item: T): void
  deleteItem(key: string): void
}
```

### In-Memory Test Implementations

Alongside the real filesystem implementations, in-memory implementations exist for testing:

```typescript
// testConfigPersistence.ts
export class InMemoryConfigPersistence implements ISingletonPersistence<Iconfiguration> {
  private data: Iconfiguration | undefined
  async read(): Promise<Iconfiguration | undefined> { return structuredClone(this.data) }
  write(item: Iconfiguration): void { this.data = structuredClone(item) }
  // Helper methods for test setup:
  setData(data: Iconfiguration): void { this.data = data }
}

// testBusPersistence.ts
export class InMemoryBusPersistence implements ICollectionPersistence<IBus> { ... }

// testSpecPersistence.ts
export class InMemorySpecPersistence implements ICollectionPersistence<IfileSpecification> { ... }
```

**Usage:**
- **Business logic unit tests**: Populate store directly, inject InMemory persistence -> no filesystem needed
- **E2E tests**: InMemory persistence instead of real filesystem -> faster, more isolated
- **Production**: Real filesystem persistence

### `index.ts` - Barrel exports

---

## Step 2: ConfigPersistence + Config Refactoring ✅ DONE

**File:** `backend/src/server/persistence/configPersistence.ts`

**Extracted from** [config.ts](../backend/src/server/config.ts):

| Method | Moves to Persistence | Stays in Config |
|--------|---------------------|-----------------|
| `readYamlAsync()` | File read, YAML parse, secrets substitution | MQTT Hassio, config defaults, TLS |
| `writeConfiguration()` | Secrets extraction, YAML write | In-memory update |
| `getSecret()` | File read/write of JWT secret | - |
| `getConfigPath()` | Path logic -> Persistence | - |
| `getSecretsPath()` | Path logic -> Persistence | - |
| `resetForE2E()` | Filesystem cleanup | In-memory reset |
| `ensureSecret()` | Secret-Datei anlegen/lesen (aus getConfiguration) | - |
| `readCertificateFile()` | TLS-Zertifikat lesen (aus readCertfile) | - |
| `createLocalExportZip()` | Zip-Export (aus createZipFromLocal) | - |

**Directory-Properties** sind static auf ConfigPersistence:
```typescript
static configDir: string = ''
static sslDir: string = ''
static dataDir: string = ''
static getLocalDir(): string { return join(configDir, 'modbus2mqtt') }
```

**Config** hat kein `fs`, kein `path`, kein `AdmZip`, kein `stream` mehr. Delegiert alles an `ConfigPersistence`.

---

## Step 3: BusPersistence + ConfigBus Refactoring

**New file:** `backend/src/server/persistence/busPersistence.ts`

**Change in** [configbus.ts](../backend/src/server/configbus.ts):
- `private static busses: IBus[]` -> `private static store = new Store<IBus>()`
- Key: `busId.toString()`

**Extracted:**

| Method | Moves to Persistence | Stays in ConfigBus |
|--------|---------------------|--------------------|
| `readBusses()` (L61) | Dir scan, YAML parse of all bus.yaml + s*.yaml | Populate store, emit events, addSpecification |
| `addBusProperties()` (L118) | mkdirSync, writeFileSync | Bus ID allocation, store.add(), return |
| `updateBusProperties()` (L140) | writeFileSync | connectionData update, store.update() |
| `deleteBusProperties()` (L151) | rmSync (recursive) | store.delete(), event |
| `writeslave()` (L192) | writeFileSync | Clone/cleanup, event, addSpecification |
| `deleteSlave()` (L252) | unlinkSync | store update, event |

**Unchanged:** Event system, `addListener`, `emitSlaveEvent`, `emitBusEvent`, `getSlave`, `getslaveBySlaveId`, `filterAllslaves`, `listDevices*`, `getIdentityEntities`

**Startup flow:**
```typescript
const busPersistence = new BusPersistence(localDir)
const busStore = new Store<IBus>()
for (const bus of busPersistence.readAll()) {
  busStore.add(bus.busId.toString(), bus)
}
ConfigBus.init(busStore, busPersistence)  // ConfigBus stores both for later writes
```

---

## Step 4: SpecPersistence + ConfigSpecification Refactoring

**New file:** `backend/src/server/persistence/specPersistence.ts`

**Change in** [configspec.ts](../backend/src/specification/configspec.ts):
- `private static specifications: IfileSpecification[]` -> `private static store = new Store<IfileSpecification>()`
- Key: `filename`

### Current State of configspec.ts

After the JSON single-file and status-as-attribute changes, `configspec.ts` is already significantly simplified:

- **Format**: All specs written as single `.json` files (via `writeSpecAsJson()`). YAML only read for legacy/migration.
- **Status**: Persisted in JSON. `readYaml()` is a pure reader — sets `publicSpecification` references and copies files from published specs, but does no status derivation.
- **Directories**: Only `public/specifications/` (read-only) and `local/specifications/` (read/write).
- **Migrator**: Receives `publicNames` and sets status during YAML -> v0.5 migration.

### Extraction Plan

| Method | Moves to Persistence | Stays in ConfigSpecification |
|--------|---------------------|------------------------------|
| `readspecifications()` | Dir scan, JSON parse, YAML parse + Migrator | - (entirely persistence) |
| `readFilesYaml()` | Legacy YAML files reading | - (entirely persistence) |
| `writeSpecAsJson()` | JSON.stringify, writeFileSync | - (entirely persistence) |
| `readYaml()` | - | Stays: set publicSpecification refs, copy files, combine published + local |
| `writeSpecificationFromFileSpec()` | writeFileSync (via writeSpecAsJson) | Status logic, store update, rename logic |
| `deleteSpecification()` | unlinkSync, rmSync | Store update |
| `changeContributionStatus()` | writeFileSync (via writeSpecAsJson) | Status update in store |
| `renameFilesPath()` | renameSync, mkdirSync | - (entirely persistence) |
| `cleanSpecForWriting()` | - | Stays: strip runtime fields before write |

**Unchanged:** `filterAllSpecifications`, `getSpecificationByFilename`, `getSpecificationByName`, `toFileSpecification`, zip functions

### Migrator ([migrator.ts](../backend/src/specification/migrator.ts))

The `Migrator` class handles backward compatibility when reading old YAML formats. It moves entirely into the persistence layer:

- `migrate(filecontent, directory?, publicNames?)` - Spec version chain: 0.1 -> 0.2 -> 0.3 -> 0.4 -> 0.5
- `migrate0_4to0_5()` - Embeds files as base64, sets status from `publicNames`
- `migrateFiles()` - Files.yaml format migration

**After refactoring:** `SpecPersistence.readAll()` calls the Migrator internally. Business classes only ever see current-version `IfileSpecification` objects with status set. The Migrator import moves from `configspec.ts` to `specPersistence.ts`.

**Startup flow:**
```typescript
const specPersistence = new SpecPersistence(configDir, dataDir)
const specStore = new Store<IfileSpecification>()
// Persistence reads from both directories
const publicSpecs = specPersistence.readPublic()   // public dir, status = published
const localSpecs = specPersistence.readLocal(publicNames)  // local dir, status from JSON
ConfigSpecification.init(specStore, specPersistence, publicSpecs, localSpecs)
```

---

## Step 5: Cleanup + Tests

### Tests
- **Unit tests for Store**: get/add/update/delete/list with cloning verification
- **Unit tests per persistence class**: temp directories, read/write round-trip
- **Integration test base64**: Write spec with base64 image -> read back -> compare base64

### Cleanup
- Remove dead imports (fs in refactored classes)
- Update `resetForE2E()` in all classes to use Store/Persistence
- Keep this document as reference

---

## Implementation Order

1. ✅ Safety tests (Step 0)
2. ✅ Store + Interfaces (Step 1) - no behavior change
3. ✅ ConfigPersistence + Config refactoring (Step 2) -> tests green
4. ✅ BusPersistence + ConfigBus refactoring (Step 3) -> tests green
5. ✅ SpecPersistence + ConfigSpecification refactoring (Step 4) -> tests green
6. ✅ Cleanup + tests for new functionality (Step 5)
7. ✅ Spec Export/Import: Zip durch JSON ersetzt, `configspec.ts` fs-frei
8. ✅ config.ts fs-frei: `ensureSecret()`, `readCertificateFile()`, `createLocalExportZip()` nach ConfigPersistence
9. ✅ Directory-Properties (`configDir`, `sslDir`, `dataDir`, `getLocalDir()`) von Config nach ConfigPersistence verschoben

## Verification

- ✅ 170 Backend-Tests grün (26 Test-Dateien, 2 skipped)
- ✅ `grep "from 'fs'" backend/src/server/config.ts` → keine Treffer
- ✅ `grep "Config\.(configDir|sslDir|dataDir|getLocalDir)" backend/src/` → keine Treffer
- ✅ `configspec.ts` hat kein `fs`-Import mehr
- ✅ `config.ts` hat kein `fs`-Import mehr

## Remaining Opportunities

- `httpFileUpload.ts` kann gelöscht werden (keine Imports mehr)
- `adm-zip` aus root `package.json` entfernen falls nur `ConfigPersistence.createLocalExportZip` es nutzt
- `configbus.ts` hat noch direkte `fs`-Aufrufe — könnte in `BusPersistence` verschoben werden
- In-Memory-Persistence-Implementierungen für schnellere Unit-Tests (Step 1 Interface vorhanden)
