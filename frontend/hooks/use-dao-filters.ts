import { useMemo } from "react";
import {
  Dao,
  DaoFilters,
  calculateDaoProgress,
  calculateDaoStatus,
} from "@shared/dao";

export function useDaoFilters(
  daos: Dao[],
  searchTerm: string,
  filters: DaoFilters,
) {
  // Pre-calculate expensive operations (optimized to avoid double calculation)
  const enrichedDaos = useMemo(() => {
    return daos.map((dao) => {
      const progress = calculateDaoProgress(dao.tasks);
      const status = calculateDaoStatus(dao.dateDepot, progress);
      return {
        ...dao,
        progress,
        status,
      };
    });
  }, [daos]);

  return useMemo(() => {
    let filtered = enrichedDaos;

    // Apply search term filter with comprehensive search
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase().trim();
      filtered = filtered.filter((dao) => {
        const searchableFields = [
          dao.numeroListe,
          dao.objetDossier,
          dao.reference,
          dao.autoriteContractante,
          ...dao.equipe.map((member) => member.name),
        ];

        return searchableFields.some(
          (field) => field && field.toLowerCase().includes(searchLower),
        );
      });
    }

    // Apply date range filter
    if (filters.dateRange?.start && filters.dateRange?.end) {
      filtered = filtered.filter((dao) => {
        const daoDate = new Date(dao.dateDepot);
        const startDate = new Date(filters.dateRange!.start);
        const endDate = new Date(filters.dateRange!.end);
        return daoDate >= startDate && daoDate <= endDate;
      });
    }

    // Apply authority filter
    if (filters.autoriteContractante) {
      filtered = filtered.filter(
        (dao) => dao.autoriteContractante === filters.autoriteContractante,
      );
    }

    // Apply status filter
    if (filters.statut) {
      filtered = filtered.filter((dao) => {
        const progress = dao.progress;
        const status = dao.status;

        switch (filters.statut) {
          case "en_cours":
            return progress < 100;
          case "termine":
            return progress >= 100;
          case "a_risque":
            return status === "urgent";
          default:
            return true;
        }
      });
    }

    // Apply team filter
    if (filters.equipe) {
      filtered = filtered.filter((dao) =>
        dao.equipe.some((member) => member.name === filters.equipe),
      );
    }

    return filtered;
  }, [searchTerm, enrichedDaos, filters]);
}
