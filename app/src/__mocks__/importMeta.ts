// Provides the import.meta.env mock for jest
Object.defineProperty(import.meta, 'env', {
  value: {
    VITE_API_BASE_URL: '',
    VITE_API_URL: '',
    DEV: false,
    MODE: 'test',
  },
});

export {};
