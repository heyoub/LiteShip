/**
 * Standalone tsx wrapper around the CLI glossary command. Lets `pnpm
 * glossary` run pre-build. Imports the command directly (skipping the
 * full dispatch graph).
 *
 * @module
 */

import { glossary } from '../packages/cli/src/commands/glossary.js';

const term = process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2] : null;
const exitCode = await glossary(term);
process.exit(exitCode);
