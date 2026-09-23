import { useEffect, useRef, useState, type DependencyList } from "react";
import { errorMessage } from "../lib/format";

export function useAsync<T>(loader: () => Promise<T>, deps: DependencyList) {
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const [tick, setTick] = useState(0);
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    loaderRef
      .current()
      .then((value) => {
        if (active) setData(value);
      })
      .catch((err: unknown) => {
        if (active) setError(errorMessage(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [...deps, tick]);

  return {
    data,
    loading,
    error,
    reload: () => setTick((value) => value + 1),
  };
}
