// =============================================================
// KJSIS Import — Console Logger
// Coloured, structured output for the import script
// =============================================================

const RESET  = '\x1b[0m';
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED    = '\x1b[31m';
const CYAN   = '\x1b[36m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';

export const log = {
  section: (title: string) => {
    console.log(`\n${BOLD}${CYAN}${'─'.repeat(55)}${RESET}`);
    console.log(`${BOLD}${CYAN}  ${title}${RESET}`);
    console.log(`${BOLD}${CYAN}${'─'.repeat(55)}${RESET}`);
  },

  success: (msg: string) =>
    console.log(`  ${GREEN}[✔]${RESET} ${msg}`),

  warn: (msg: string) =>
    console.log(`  ${YELLOW}[⚠]${RESET} ${msg}`),

  error: (msg: string) =>
    console.log(`  ${RED}[✘]${RESET} ${msg}`),

  info: (msg: string) =>
    console.log(`  ${DIM}[·]${RESET} ${msg}`),

  skip: (msg: string) =>
    console.log(`  ${YELLOW}[↷]${RESET} ${DIM}${msg}${RESET}`),

  summary: (label: string, inserted: number, skipped: number, failed: number) => {
    console.log(
      `  ${BOLD}${label}${RESET}:  ` +
      `${GREEN}${inserted} inserted${RESET}  ` +
      `${YELLOW}${skipped} skipped${RESET}  ` +
      `${RED}${failed} failed${RESET}`,
    );
  },

  done: (totalMs: number) => {
    console.log(`\n${BOLD}${GREEN}✔ Import complete in ${totalMs}ms${RESET}\n`);
  },

  fatal: (msg: string, err?: unknown) => {
    console.error(`\n${BOLD}${RED}✘ FATAL: ${msg}${RESET}`);
    if (err) console.error(err);
    process.exit(1);
  },
};
