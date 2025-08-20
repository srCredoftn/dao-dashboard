import type {
  LoginCredentials,
  AuthResponse,
  AuthUser,
  User,
} from "@shared/dao";
import { simpleFetch } from "@/utils/simple-fetch";

const API_BASE_URL = "/api/auth";

class AuthApiService {
  private token: string | null = null;

  constructor() {
    // Load token from localStorage on initialization
    this.token = localStorage.getItem("auth_token");
  }

  private async request<T>(
    endpoint: string,
    options?: RequestInit,
    retryCount = 0,
    maxRetries = 2,
  ): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;

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

    // Add authorization header if token exists
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    try {
      const response = await simpleFetch.fetch(url, {
        ...options,
        headers,
        timeout: 10000, // 10 secondes timeout
        maxRetries: 2,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        // If 401, clear local storage (invalid/expired token)
        if (response.status === 401) {
          console.warn("⚠️ Auth API returned 401 - clearing auth data");
          this.clearAuth();

          // Don't redirect to login from here, let the component handle it
          // This prevents infinite loops during initialization
        }

        // Special handling for rate limiting (429)
        if (response.status === 429) {
          const retryAfter = response.headers.get("Retry-After");
          const rateLimitReset = response.headers.get("X-RateLimit-Reset");

          console.warn("🚨 Rate limit exceeded:", {
            retryAfter,
            rateLimitReset,
            endpoint,
            timestamp: new Date().toISOString(),
          });

          // Create more helpful error message
          const resetTime = rateLimitReset
            ? new Date(parseInt(rateLimitReset) * 1000).toLocaleTimeString()
            : "dans quelques minutes";

          throw new Error(
            `Trop de tentatives de connexion. Veuillez réessayer ${resetTime}. ` +
              `Si le problème persiste, contactez l'administrateur.`,
          );
        }

        // Message d'erreur simple pour les erreurs d'authentification
        if (response.status === 401) {
          throw new Error("Identifiants incorrects, veuillez réessayer");
        }

        throw new Error(
          errorData.error || `HTTP error! status: ${response.status}`,
        );
      }

      return await response.json();
    } catch (error) {
      // Gestion spécifique des erreurs de réseau avec retry
      if (
        error instanceof TypeError &&
        error.message.includes("Failed to fetch")
      ) {
        console.warn(
          `🌐 Network error for ${endpoint} (attempt ${retryCount + 1}/${maxRetries + 1}):`,
          error.message,
        );

        if (retryCount < maxRetries) {
          // Délai exponentiel : 1s, puis 2s, puis 4s
          const delay = Math.pow(2, retryCount) * 1000;
          console.log(`⏳ Retrying in ${delay}ms...`);

          await new Promise((resolve) => setTimeout(resolve, delay));
          return this.request<T>(endpoint, options, retryCount + 1, maxRetries);
        } else {
          throw new Error(
            "Impossible de se connecter au serveur. Vérifiez votre connexion internet et réessayez.",
          );
        }
      }

      // Gestion des timeouts
      if (error instanceof DOMException && error.name === "TimeoutError") {
        console.warn(`⏰ Request timeout for ${endpoint}`);
        throw new Error(
          "La requête a pris trop de temps. Vérifiez votre connexion internet.",
        );
      }

      // Gestion des AbortError (peut arriver avec le timeout)
      if (error instanceof DOMException && error.name === "AbortError") {
        console.warn(`🚫 Request aborted for ${endpoint}`);
        throw new Error("La requête a été interrompue. Veuillez réessayer.");
      }

      console.error(`Auth API request failed for ${endpoint}:`, error);
      throw error;
    }
  }

  // Login user
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      const response = await this.request<AuthResponse>("/login", {
        method: "POST",
        body: JSON.stringify(credentials),
      });

      // Store token in localStorage and memory
      this.token = response.token;
      localStorage.setItem("auth_token", response.token);
      localStorage.setItem("auth_user", JSON.stringify(response.user));

      console.log("🔐 User logged in:", response.user.email);
      return response;
    } catch (error) {
      console.error("Login failed:", error);

      // Message simple pour les erreurs d'authentification
      if (error instanceof Error) {
        if (
          error.message.includes("401") ||
          error.message.includes("Identifiants incorrects")
        ) {
          throw new Error("Identifiants incorrects, veuillez réessayer");
        }
      }

      throw error;
    }
  }

  // Logout user
  async logout(): Promise<void> {
    try {
      if (this.token) {
        await this.request<void>("/logout", {
          method: "POST",
        });
      }
    } catch (error) {
      console.error("Logout API call failed:", error);
      // Continue with local logout even if API call fails
    } finally {
      // Clear local storage and memory
      this.token = null;
      localStorage.removeItem("auth_token");
      localStorage.removeItem("auth_user");
      console.log("👋 User logged out");
    }
  }

  // Get current user info
  async getCurrentUser(): Promise<AuthUser> {
    return this.request<{ user: AuthUser }>("/me").then((res) => res.user);
  }

  // Get stored user from localStorage
  getStoredUser(): AuthUser | null {
    try {
      const userData = localStorage.getItem("auth_user");
      return userData ? JSON.parse(userData) : null;
    } catch {
      return null;
    }
  }

  // Check if user is authenticated
  isAuthenticated(): boolean {
    return !!this.token && !!this.getStoredUser();
  }

  // Get current token
  getToken(): string | null {
    return this.token;
  }

  // Admin operations
  async getAllUsers(): Promise<User[]> {
    return this.request<User[]>("/users");
  }

  async createUser(userData: {
    name: string;
    email: string;
    role: string;
  }): Promise<User> {
    return this.request<User>("/users", {
      method: "POST",
      body: JSON.stringify(userData),
    });
  }

  async updateUserRole(userId: string, role: string): Promise<User> {
    return this.request<User>(`/users/${userId}/role`, {
      method: "PUT",
      body: JSON.stringify({ role }),
    });
  }

  async deactivateUser(userId: string): Promise<void> {
    return this.request<void>(`/users/${userId}`, {
      method: "DELETE",
    });
  }

  async changePassword(newPassword: string): Promise<void> {
    return this.request<void>("/change-password", {
      method: "POST",
      body: JSON.stringify({ newPassword }),
    });
  }

  async updateProfile(profileData: {
    name: string;
    email: string;
  }): Promise<AuthUser> {
    return this.request<AuthUser>("/profile", {
      method: "PUT",
      body: JSON.stringify(profileData),
    });
  }

  // Clear authentication data (useful for expired tokens)
  clearAuth(): void {
    console.log("🧹 Clearing authentication data...");
    this.token = null;
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    console.log("✅ Authentication data cleared");
  }
}

export const authService = new AuthApiService();
