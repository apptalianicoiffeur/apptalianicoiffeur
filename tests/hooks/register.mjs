/** Registers the module hooks for the test / migration processes. */
import { register } from 'node:module';

register('./extensionless.mjs', import.meta.url);
