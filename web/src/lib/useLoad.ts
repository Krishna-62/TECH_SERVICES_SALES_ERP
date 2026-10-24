import { useCallback, useEffect, useState } from 'react';

// Loads data on mount and exposes reload() for after a mutation.
export function useLoad<T>(load: () => Promise<T>, initial: T) {
  const [data, setData] = useState<T>(initial);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    return load()
      .then((value) => {
        setData(value);
        setError('');
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
    // `load` is fixed for the component's lifetime; re-running on identity changes would loop.
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, error, loading, reload };
}
