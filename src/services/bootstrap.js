/**
 * Bootstrap for services: re-exports the Firebase singletons so service
 * modules never import from config directly twice (keeps imports tidy).
 */
export {
  app,
  auth,
  db,
  getMessagingSafe,
  OWNER_EMAIL,
  VAPID_KEY,
  isFirebaseConfigured,
} from '../config/firebase';
export { COLLECTIONS, SETTINGS_DOCS } from '../utils/constants';
