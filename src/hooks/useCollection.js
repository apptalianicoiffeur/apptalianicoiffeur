/**
 * Generic real-time collection hook (Firestore onSnapshot).
 * `makeQuery` receives nothing and returns a query, or null to skip.
 */
import { useEffect, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';

export function useCollection(makeQuery, deps = []) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    let unsub = () => {};
    setLoading(true);
    setError(null);
    try {
      const q = makeQuery();
      if (!q) {
        setData([]);
        setLoading(false);
        return () => {};
      }
      unsub = onSnapshot(
        q,
        (snap) => {
          if (!alive) return;
          setData(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          setLoading(false);
        },
        (err) => {
          if (!alive) return;
          setError(err);
          setLoading(false);
        }
      );
    } catch (err) {
      setError(err);
      setLoading(false);
    }
    return () => {
      alive = false;
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error };
}

/** Real-time single-document hook. Returns { data, loading, error }. */
export function useDocument(makeRef, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    let unsub = () => {};
    setLoading(true);
    setError(null);
    try {
      const ref = makeRef();
      if (!ref) {
        setData(null);
        setLoading(false);
        return () => {};
      }
      unsub = onSnapshot(
        ref,
        (snap) => {
          if (!alive) return;
          setData(snap.exists() ? { id: snap.id, ...snap.data() } : null);
          setLoading(false);
        },
        (err) => {
          if (!alive) return;
          setError(err);
          setLoading(false);
        }
      );
    } catch (err) {
      setError(err);
      setLoading(false);
    }
    return () => {
      alive = false;
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error };
}
