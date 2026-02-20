# Persistence Layer Refactoring Plan

## Context

The three static classes `Config`, `ConfigBus`, and `ConfigSpecification` currently mix in-memory state management with filesystem I/O. Goal: Extract persistence logic into dedicated classes, introduce a generic in-memory store. Additionally: Specification files as base64 in the spec object (API/frontend), while remaining as binary files on disk.

**Risk minimization**: Only extract read/write. Business logic, events, and public API remain unchanged as much as possible. Filesystem format stays identical.

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
| 1 | **Given** specifications/*.yaml in public + local + contributed -> **When** readAll per dir -> **Then** correct number of specs read | Read contract |
| 2 | **Given** files/{specname}/files.yaml exists -> **When** readAll -> **Then** spec.files[] correctly populated, URLs built | Files read contract |
| 3 | **Given** no files.yaml -> **When** readAll -> **Then** spec.files = [] | Edge case |
| 4 | **Given** IfileSpecification -> **When** writeItem -> **Then** {filename}.yaml with correct YAML | Write contract |
| 5 | **Given** writeItem -> **When** readAll -> **Then** identical spec | Round-trip |
| 6 | **Given** IimageAndDocumentUrl[] -> **When** writeFiles -> **Then** files.yaml correct | Files write contract |
| 7 | **Given** binary file in files/{spec}/ -> **When** readAll -> **Then** binary available | Binary file reading (basis for base64) |
| 8 | **Given** spec in local -> **When** deleteItem -> **Then** YAML + files dir gone | Delete contract |

### 0e. ConfigSpecification Business Logic (`backend/tests/specification/configspec_logic_test.tsx`)

| # | Test (Given -> When -> Then) | What is secured |
|---|---|---|
| 9 | **Given** specs from 3 tiers in store -> **When** readYaml merge logic -> **Then** status correct (published/cloned/added/contributed) | Three-tier merge |
| 10 | **Given** specs in store -> **When** getSpecificationByFilename -> **Then** correct spec | Lookup |
| 11 | **Given** specs in store -> **When** filterAllSpecifications(fn) -> **Then** fn called for each spec | Iteration |
| 12 | **Given** spec with filename change -> **When** write -> **Then** rename logic correct | Rename |

### Test Summary: ~26 New Tests

| Area | Persistence Contract | Business Logic | Total |
|------|---------------------|----------------|-------|
| Config | 5 | - | 5 |
| ConfigBus | 6 | 3 | 9 |
| ConfigSpecification | 8 | 4 | 12 |
| **Total** | **19** | **7** | **26** |

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

## Step 2: ConfigPersistence + Config Refactoring

**New file:** `backend/src/server/persistence/configPersistence.ts`

**Extracted from** [config.ts](../backend/src/server/config.ts):

| Method | Moves to Persistence | Stays in Config |
|--------|---------------------|-----------------|
| `readYamlAsync()` (L398) | File read, YAML parse, secrets substitution | MQTT Hassio, config defaults, TLS |
| `writeConfiguration()` (L470) | Secrets extraction, YAML write | In-memory update |
| `getSecret()` (L152) | File read/write of JWT secret | - |
| `getConfigPath()` (L513) | Path logic -> Persistence | - |
| `getSecretsPath()` (L516) | Path logic -> Persistence | - |
| `resetForE2E()` (L520) | Filesystem cleanup | In-memory reset |

**Config remains a singleton** - no Store needed (single object, not a collection). Persistence is injected.

**Startup flow:**
```typescript
const configPersistence = new ConfigPersistence(configDir)
const configData = await configPersistence.read()
Config.init(configData, configPersistence)  // Config stores reference for later writes
```

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

**Extracted:**

| Method | Moves to Persistence | Stays in ConfigSpecification |
|--------|---------------------|------------------------------|
| `readspecifications()` (L154) | Dir scan, YAML parse, migration (incl. Migrator) | - (entirely persistence) |
| `readFilesYaml()` (L133) | File read, files.yaml parse, migration (incl. Migrator) | - (entirely persistence) |
| `readYaml()` (L197) | - | Stays! Three-tier merge logic (published/contributed/local) |
| `writeSpecificationFromFileSpec()` (L451) | writeFileSync, mkdirSync | Status logic, store update, rename logic |
| `deleteSpecification()` (L529) | unlinkSync, rmSync | Store update |
| `appendSpecificationUrls()` (L73) | readFileSync, writeFileSync | Mutex, spec.files update |
| `deleteSpecificationFile()` (L324) | unlinkSync, files.yaml update | - |
| `changeContributionStatus()` (L399) | renameSync, rmSync, cpSync | Status determination |
| `renameFilesPath()` (L362) | renameSync, mkdirSync | - (entirely persistence) |

**Unchanged:** `filterAllSpecifications`, `getSpecificationByFilename`, `getSpecificationByName`, `toFileSpecification`, `cleanSpecForWriting`, `filesMutex`, zip functions

### Migrator ([migrator.ts](../backend/src/specification/migrator.ts), 216 lines)

The `Migrator` class handles backward compatibility when reading old file formats from disk. It moves entirely into the persistence layer:

- `migrate()` - Spec version chain: 0.1 -> 0.2 -> 0.3 -> 0.4 (current `SPECIFICATION_VERSION`)
- `migrateFiles()` - Files.yaml format migration

**After refactoring:** `SpecPersistence.readAll()` calls the Migrator internally. Business classes (`ConfigSpecification`) only ever see current-version data structures. The Migrator import moves from `configspec.ts` to `specPersistence.ts`.

**Startup flow:**
```typescript
const specPersistence = new SpecPersistence(configDir, dataDir)
const specStore = new Store<IfileSpecification>()
// Persistence reads from all 3 directories
const specs = specPersistence.readAll()  // public + contributed + local (raw, without status merge)
ConfigSpecification.init(specStore, specPersistence, specs)  // Merge logic stays here
```

---

## Step 5: Base64 Files in Specifications

### 5a. Type Change

In [types.ts](../backend/src/shared/specification/types.ts) L261-265:

```typescript
export interface IimageAndDocumentUrl {
  url: string
  fileLocation: FileLocation
  usage: SpecificationFileUsage
  data?: string      // NEW: base64-encoded content (local files)
  mimeType?: string  // NEW: e.g., 'image/png'
}
```

### 5b. SpecPersistence: base64 <-> Binary Conversion

**On read** (`readAll`):
1. Read spec YAML + files.yaml (as before)
2. For each local file (`fileLocation == Local`): read binary file -> base64 -> set `data` and `mimeType`

**On write** (`writeItem`):
1. For each file with `data`: decode base64 -> write binary file to disk
2. Remove `data` and `mimeType` from the copy written to files.yaml
3. Write files.yaml + spec.yaml (format same as today)

### 5c. Backend API Changes

In [httpserver.ts](../backend/src/server/httpserver.ts):
- **Remove**: `POST /api/upload` (multer, L735-775), `POST /api/addFilesUrl` (L713), `DELETE /api/upload` (L803)
- **Modify**: `POST /api/specification` now contains files with base64
- **Modify**: `GET /api/specification` returns files with base64
- **Remove**: [httpFileUpload.ts](../backend/src/server/httpFileUpload.ts) (multer storage config)

### 5d. Frontend Changes

In [upload-files.component.ts](../frontend/src/app/specification/upload-files/upload-files.component.ts):
- `onFileDropped()` (L115): `FileReader.readAsDataURL()` instead of FormData
- Files are stored as base64 in `spec.files[]`
- No separate upload API call needed
- Display images via `data:${mimeType};base64,${data}` src

In [api-service.ts](../frontend/src/app/services/api-service.ts):
- Remove `postFile()` (L404)
- Remove `postAddFilesUrl()` (L414)
- Remove `deleteUploadedFile()` (L480)

---

## Step 6: Cleanup + Tests

### Tests
- **Unit tests for Store**: get/add/update/delete/list with cloning verification
- **Unit tests per persistence class**: temp directories, read/write round-trip
- **Integration test base64**: Write spec with base64 image -> verify binary file on disk -> read back -> compare base64

### Cleanup
- Remove dead imports (multer, fs in refactored classes)
- Update `resetForE2E()` in all classes to use Store/Persistence
- Keep this document as reference

---

## Implementation Order

0. **Safety tests** (see above)
1. Store + Interfaces (no behavior change)
2. ConfigPersistence + Config refactoring -> tests green
3. BusPersistence + ConfigBus refactoring -> tests green
4. SpecPersistence + ConfigSpecification refactoring -> tests green
5. Base64 type change + persistence conversion
6. Backend API (remove upload endpoints)
7. Frontend (FileReader instead of FormData)
8. Cleanup + tests for new functionality (Store, base64)

## Verification

- **After step 0**: All new tests green
- **After steps 2-4**: All new + existing tests green (refactoring safety)
- Backend compiles after each step
- Manual test: Startup -> read config -> read busses -> read specs
- Existing E2E tests (`resetForE2E` paths) work
- File upload in frontend test (base64 round-trip)
- Filesystem format identical to before (diff YAML files)
