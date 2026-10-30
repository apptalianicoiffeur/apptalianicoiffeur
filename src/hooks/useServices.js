/**
 * Services hook: active services for clients, all services for the owner.
 */
import { collection, orderBy, query, where } from 'firebase/firestore';
import { db, COLLECTIONS } from '../services/bootstrap';
import { useCollection } from './useCollection';

export function useServices({ all = false } = {}) {
  return useCollection(
    () => {
      if (!db) return null;
      return all
        ? query(collection(db, COLLECTIONS.SERVICES), orderBy('createdAt', 'asc'))
        : query(collection(db, COLLECTIONS.SERVICES), where('active', '==', true));
    },
    [all]
  );
}
