import type { Dao } from "@shared/dao";
import { cacheService } from "./cacheService";

const API_BASE_URL = "/api";

class ApiService {
  private async request<T>(
    endpoint: string,
    options?: RequestInit,
  ): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;

    // Get token from localStorage
    const token = localStorage.getItem("auth_token");

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Add existing headers if they exist
    if (options?.headers) {
      if (options.headers instanceof Headers) {
        options.headers.forEach((value, key) => {
          headers[key] = value;
        });
      } else if (Array.isArray(options.headers)) {
        options.headers.forEach(([key, value]) => {
          headers[key] = value;
        });
      } else {
        Object.assign(headers, options.headers);
      }
    }

    // Add Authorization header if token exists
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        // Handle authentication errors
        if (response.status === 401) {
          // Clear invalid token
          localStorage.removeItem("auth_token");
          localStorage.removeItem("auth_user");

          // Redirect to login page if not already there
          if (!window.location.pathname.includes("/login")) {
            window.location.href = "/login";
          }

          throw new Error("Session expirée. Veuillez vous reconnecter.");
        }

        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `HTTP error! status: ${response.status}`,
        );
      }

      return await response.json();
    } catch (error) {
      // Handle network errors
      if (error instanceof TypeError && error.message === "Failed to fetch") {
        throw new Error(
          "Erreur de connexion. Vérifiez votre connexion internet.",
        );
      }

      console.error(`API request failed for ${endpoint}:`, error);
      throw error;
    }
  }

  // DAO operations
  async getAllDaos(): Promise<Dao[]> {
    return cacheService.getOrSet(
      "all-daos",
      () => this.request<Dao[]>("/dao"),
      2 * 60 * 1000, // Cache pendant 2 minutes
    );
  }

  async getDaoById(id: string): Promise<Dao> {
    return cacheService.getOrSet(
      `dao-${id}`,
      () => this.request<Dao>(`/dao/${id}`),
      3 * 60 * 1000, // Cache pendant 3 minutes
    );
  }

  async createDao(
    daoData: Omit<Dao, "id" | "createdAt" | "updatedAt">,
  ): Promise<Dao> {
    const result = await this.request<Dao>("/dao", {
      method: "POST",
      body: JSON.stringify(daoData),
    });

    // Invalider le cache après création
    cacheService.delete("all-daos");

    return result;
  }

  async updateDao(
    id: string,
    updates: Partial<Dao>,
    skipCacheInvalidation = false,
  ): Promise<Dao> {
    const result = await this.request<Dao>(`/dao/${id}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    });

    // Invalider le cache après mise à jour (sauf si explicitement désactivé pour les mises à jour fréquentes)
    if (!skipCacheInvalidation) {
      cacheService.delete("all-daos");
      cacheService.delete(`dao-${id}`);
    } else {
      // Pour les mises à jour fréquentes, on met simplement à jour le cache
      cacheService.set(`dao-${id}`, result, 3 * 60 * 1000);
    }

    return result;
  }

  async deleteDao(id: string): Promise<void> {
    const result = await this.request<void>(`/dao/${id}`, {
      method: "DELETE",
    });

    // Invalider le cache après suppression
    cacheService.delete("all-daos");
    cacheService.delete(`dao-${id}`);

    return result;
  }

  async getNextDaoNumber(): Promise<string> {
    const response = await this.request<{ nextNumber: string }>(
      "/dao/next-number",
    );
    return response.nextNumber;
  }
}

export const apiService = new ApiService();
