import * as path from 'path';
import * as sqlite from 'sqlite';
import {promises as fs} from 'fs';

export interface StorageAPI {
  getItem<T>(key: string): Promise<T>;
  setItem<T>(key: string, value: T): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export default class Storage {
  public static async connect(filename: string) {
    // Relative to CWD, so should be project root
    await Storage.checkFile(filename);
    const db = await sqlite.open(filename, {promise: Promise});
    const storage = new this(db);
    await storage.checkDb();
    return storage;
  }
  private static async checkFile(filename: string) {
    await fs.mkdir(path.dirname(filename), {recursive: true});
  }

  public readonly table = 'storage';

  constructor(public db: sqlite.Database) { }

  public async checkDb(): Promise<void> {
    const name = await this.db.get('SELECT name FROM sqlite_master WHERE type="table" AND name = ?', this.table);
    if (!name) {
      // Create table if it doesn't exist
      await this.db.run(`CREATE TABLE ${this.table}(
  key varchar(40),
  value varchar(3000),
  PRIMARY KEY(key)
  )`);
    }
  }

  public async setItem(key: string, value: any): Promise<void> {
    if (!key) throw Error('Key is required');
    const editing = await this.db.get(`SELECT key FROM ${this.table} WHERE key = ?`, key);
    if (editing) await this.db.run(`UPDATE ${this.table} SET value = ? WHERE key = ?`, JSON.stringify(value), key);
    else await this.db.run(`INSERT INTO ${this.table} (key, value) VALUES (?, ?)`, key, JSON.stringify(value));
  }
  public async getItem<T>(key: string): Promise<T> {
    if (!key) throw Error('Key is required');
    const obj = await this.db.get(`SELECT key, value FROM ${this.table} WHERE key = ?`, key);
    console.log()
    if (!obj) return obj;
    return JSON.parse(obj.value);
  }
  public async removeItem(key: string): Promise<void> {
    if (!key) throw Error('Key is required');
    await this.db.run(`DELETE FROM ${this.table} WHERE key = ?`, key);
  }

  public get api(): StorageAPI {
    return {
      getItem: (k) => this.getItem(k),
      setItem: (k, v) => this.setItem(k, v),
      removeItem: (k) => this.removeItem(k)
    };
  }
}
