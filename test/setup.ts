import { vi } from "vitest";

// Mock des variables d'environnement pour les tests
process.env.JWT_SECRET = "test-jwt-secret-for-testing-purposes-only";
process.env.NODE_ENV = "test";

// Mock du localStorage pour les tests Node
const localStorageMock = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(() => null),
  removeItem: vi.fn(() => null),
  clear: vi.fn(() => null),
};

// Mock global pour localStorage
Object.defineProperty(global, "localStorage", {
  value: localStorageMock,
  writable: true,
});

// Mock du fetch pour les tests
global.fetch = vi.fn();

// Mock de console pour éviter les logs pendant les tests
console.log = vi.fn();
console.warn = vi.fn();
console.error = vi.fn();

// Mock des timers pour les tests de délai
vi.useFakeTimers();

beforeEach(() => {
  // Reset tous les mocks avant chaque test
  vi.clearAllMocks();
  localStorage.clear();
});

afterEach(() => {
  // Nettoyer après chaque test
  vi.clearAllTimers();
});
