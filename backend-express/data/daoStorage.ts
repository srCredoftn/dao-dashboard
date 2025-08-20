import { serverMockDaos } from "./mockDaos";
import type { Dao } from "@shared/dao";

// Shared in-memory storage for DAOs with optimized indexing
// In production, this would be replaced with a database service
class DaoStorage {
  private storage: Dao[] = [...serverMockDaos];
  private idIndex: Map<string, number> = new Map();
  private autoriteIndex: Map<string, Dao[]> = new Map();

  constructor() {
    this.rebuildIndexes(true);
  }

  // Rebuild all indexes
  private rebuildIndexes(verbose = false): void {
    this.idIndex.clear();
    this.autoriteIndex.clear();

    this.storage.forEach((dao, index) => {
      // Index by ID
      this.idIndex.set(dao.id, index);

      // Index by autorite contractante
      const autorite = dao.autoriteContractante;
      if (!this.autoriteIndex.has(autorite)) {
        this.autoriteIndex.set(autorite, []);
      }
      this.autoriteIndex.get(autorite)!.push(dao);
    });

    if (verbose) {
      console.log(
        `📊 DAO indexes rebuilt: ${this.storage.length} DAOs indexed`,
      );
    }
  }

  // Get all DAOs
  getAll(): Dao[] {
    return this.storage;
  }

  // Find DAO by ID (optimized with index)
  findById(id: string): Dao | undefined {
    const index = this.idIndex.get(id);
    return index !== undefined ? this.storage[index] : undefined;
  }

  // Find DAO index by ID (optimized with index)
  findIndexById(id: string): number {
    return this.idIndex.get(id) ?? -1;
  }

  // Add new DAO
  add(dao: Dao): void {
    this.storage.push(dao);
    this.rebuildIndexes(true); // Rebuild indexes after adding
  }

  // Update DAO at index (optimized)
  updateAtIndex(index: number, dao: Dao): void {
    if (index >= 0 && index < this.storage.length) {
      const oldDao = this.storage[index];
      this.storage[index] = dao;

      // Optimisation: seulement reconstruire les indexes si nécessaire
      if (
        oldDao.id !== dao.id ||
        oldDao.autoriteContractante !== dao.autoriteContractante
      ) {
        this.rebuildIndexes(true);
      } else {
        // Pas besoin de reconstruire les indexes pour les mises à jour de contenu
        console.log(`📝 DAO ${dao.id} updated (indexes preserved)`);
      }
    }
  }

  // Delete DAO by ID
  deleteById(id: string): boolean {
    const index = this.findIndexById(id);
    if (index !== -1) {
      this.storage.splice(index, 1);
      this.rebuildIndexes(true); // Rebuild indexes after deleting
      return true;
    }
    return false;
  }

  // Find DAOs by autorite contractante (optimized with index)
  findByAutorite(autorite: string): Dao[] {
    return this.autoriteIndex.get(autorite) || [];
  }

  // Filter DAOs by condition
  filter(predicate: (dao: Dao) => boolean): Dao[] {
    return this.storage.filter(predicate);
  }

  // Get storage size
  size(): number {
    return this.storage.length;
  }
}

// Export singleton instance
export const daoStorage = new DaoStorage();
