// Utilitaire pour créer un fetch sécurisé qui évite les interceptions de services tiers

// Stocker une référence native au fetch original
const originalFetch = (() => {
  // Essayer de récupérer le fetch natif avant qu'il soit modifié
  if (typeof window !== "undefined" && window.fetch) {
    try {
      // Vérifier si on peut créer un iframe en sécurité
      if (document && document.createElement && document.documentElement) {
        const iframe = document.createElement("iframe");
        iframe.style.display = "none";
        iframe.style.position = "absolute";
        iframe.style.left = "-9999px";

        document.documentElement.appendChild(iframe);

        // Attendre que l'iframe soit prêt
        let iframeFetch: typeof fetch | null = null;

        if (iframe.contentWindow && iframe.contentWindow.fetch) {
          // Créer une copie liée de la fonction fetch
          iframeFetch = iframe.contentWindow.fetch.bind(iframe.contentWindow);
        }

        // Nettoyer l'iframe de manière asynchrone pour éviter les problèmes de timing
        setTimeout(() => {
          try {
            if (iframe.parentNode) {
              iframe.parentNode.removeChild(iframe);
            }
          } catch (e) {
            console.warn("Could not clean up iframe:", e);
          }
        }, 0);

        // Retourner le fetch de l'iframe si disponible
        if (iframeFetch) {
          return iframeFetch;
        }
      }

      // Fallback sûr vers le fetch courant
      return window.fetch.bind(window);
    } catch (error) {
      console.warn(
        "Could not create secure fetch reference, using window.fetch:",
        error,
      );
      return window.fetch.bind(window);
    }
  }

  // Fallback pour les environnements sans window
  return globalThis.fetch || fetch;
})();

// Interface pour les options étendues
interface SecureFetchOptions extends RequestInit {
  useNativeFetch?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
}

// Classe pour gérer les appels fetch sécurisés
export class SecureFetch {
  private static instance: SecureFetch;

  static getInstance(): SecureFetch {
    if (!SecureFetch.instance) {
      SecureFetch.instance = new SecureFetch();
    }
    return SecureFetch.instance;
  }

  // Détecter si fetch a été modifié par un service tiers
  private isNativeFetch(): boolean {
    if (typeof window === "undefined") return true;

    // Vérifier si window.fetch a été modifié
    const fetchString = window.fetch.toString();

    // Indices que fetch a été intercepté
    const interceptorSignatures = [
      "fullstory",
      "FullStory",
      "fs.js",
      "sentry",
      "Sentry",
      "datadog",
      "DataDog",
      "bugsnag",
      "Bugsnag",
      "eval",
      "messageHandler",
    ];

    return !interceptorSignatures.some((signature) =>
      fetchString.toLowerCase().includes(signature.toLowerCase()),
    );
  }

  // Créer un timeout pour les requêtes
  private createTimeoutSignal(timeoutMs: number): AbortSignal {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), timeoutMs);
    return controller.signal;
  }

  // Méthode principale de fetch sécurisé
  async fetch(
    url: string | URL,
    options: SecureFetchOptions = {},
  ): Promise<Response> {
    const {
      useNativeFetch = false,
      maxRetries = 2,
      retryDelay = 1000,
      timeout = 10000,
      ...fetchOptions
    } = options;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(
          `🌐 Secure fetch attempt ${attempt + 1}/${maxRetries + 1}: ${url}`,
        );

        // Choisir la fonction fetch à utiliser avec validation
        let fetchFunction: typeof fetch;

        try {
          if (useNativeFetch || !this.isNativeFetch()) {
            // Vérifier que originalFetch est encore valide
            if (typeof originalFetch === "function") {
              fetchFunction = originalFetch;
            } else {
              console.warn(
                "Original fetch is not available, falling back to window.fetch",
              );
              fetchFunction = window.fetch.bind(window);
            }
          } else {
            fetchFunction = window.fetch.bind(window);
          }
        } catch (scopeError) {
          console.warn(
            "Fetch function selection failed, using window.fetch:",
            scopeError,
          );
          fetchFunction = window.fetch.bind(window);
        }

        // Ajouter un timeout si pas déjà spécifié
        const requestOptions = { ...fetchOptions };
        if (!requestOptions.signal && timeout > 0) {
          requestOptions.signal = this.createTimeoutSignal(timeout);
        }

        const response = await fetchFunction(url, requestOptions);

        // Log du succès
        console.log(`✅ Secure fetch successful: ${url} (${response.status})`);
        return response;
      } catch (error) {
        lastError = error as Error;
        const errorMessage = lastError.message;

        console.warn(
          `⚠️ Secure fetch attempt ${attempt + 1} failed:`,
          errorMessage,
        );

        // Vérifier si c'est une erreur de portée globale
        const isGlobalScopeError = errorMessage.includes(
          "global scope is shutting down",
        );

        // Vérifier si c'est une erreur réseau temporaire
        const isRetriableError =
          errorMessage.includes("Failed to fetch") ||
          errorMessage.includes("network") ||
          errorMessage.includes("timeout") ||
          errorMessage.includes("AbortError") ||
          isGlobalScopeError; // Ajouter les erreurs de portée globale comme retriables

        // Si c'est une erreur de portée globale, forcer l'utilisation de window.fetch
        if (isGlobalScopeError && attempt < maxRetries) {
          console.log(
            "🔄 Global scope error detected, forcing window.fetch for next attempt",
          );
          // Pas besoin de délai pour ce type d'erreur
          continue;
        }

        // Ne pas retry sur la dernière tentative ou si l'erreur n'est pas retriable
        if (attempt === maxRetries || !isRetriableError) {
          break;
        }

        // Délai avant le retry (délai exponentiel)
        const delay = retryDelay * Math.pow(2, attempt);
        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // Si toutes les tentatives ont échoué
    console.error(`❌ All secure fetch attempts failed for: ${url}`);

    // Améliorer le message d'erreur
    if (lastError) {
      const enhancedError = new Error(
        `Network request failed after ${maxRetries + 1} attempts: ${lastError.message}`,
      );
      enhancedError.name = "SecureFetchError";
      enhancedError.stack = lastError.stack;
      throw enhancedError;
    }

    throw new Error("Network request failed: Unknown error");
  }

  // Méthodes utilitaires pour les types de requêtes courants
  async get(
    url: string | URL,
    options: SecureFetchOptions = {},
  ): Promise<Response> {
    return this.fetch(url, { ...options, method: "GET" });
  }

  async post(
    url: string | URL,
    data?: any,
    options: SecureFetchOptions = {},
  ): Promise<Response> {
    const postOptions: SecureFetchOptions = {
      ...options,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    };

    if (data !== undefined) {
      postOptions.body = typeof data === "string" ? data : JSON.stringify(data);
    }

    return this.fetch(url, postOptions);
  }

  async put(
    url: string | URL,
    data?: any,
    options: SecureFetchOptions = {},
  ): Promise<Response> {
    const putOptions: SecureFetchOptions = {
      ...options,
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    };

    if (data !== undefined) {
      putOptions.body = typeof data === "string" ? data : JSON.stringify(data);
    }

    return this.fetch(url, putOptions);
  }

  async delete(
    url: string | URL,
    options: SecureFetchOptions = {},
  ): Promise<Response> {
    return this.fetch(url, { ...options, method: "DELETE" });
  }

  // Diagnostic pour vérifier l'état du fetch
  diagnose(): {
    isNativeFetch: boolean;
    fetchSource: string;
    recommendations: string[];
  } {
    const isNative = this.isNativeFetch();
    const fetchString =
      typeof window !== "undefined"
        ? window.fetch.toString()
        : "N/A (server-side)";

    const recommendations: string[] = [];

    if (!isNative) {
      recommendations.push(
        "Fetch has been intercepted by a third-party service",
      );
      recommendations.push(
        "Consider using useNativeFetch: true for critical requests",
      );
      recommendations.push(
        "Check for services like FullStory, Sentry, or DataDog",
      );
    }

    return {
      isNativeFetch: isNative,
      fetchSource:
        fetchString.substring(0, 200) + (fetchString.length > 200 ? "..." : ""),
      recommendations,
    };
  }
}

// Instance singleton pour l'exportation
export const secureFetch = SecureFetch.getInstance();

// Export par défaut pour une utilisation simple
export default secureFetch;

// Fonction utilitaire pour remplacer window.fetch dans les cas critiques
export function createFetchPolyfill(): typeof fetch {
  return secureFetch.fetch.bind(secureFetch);
}

// Hook pour diagnostiquer les problèmes de fetch
export function useFetchDiagnostics() {
  return secureFetch.diagnose();
}
