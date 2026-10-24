const QUOTE_MARK = `
    .d88b.    .d88b.
   d88888b   d88888b
   8888888   8888888
   Y888888   Y888888
    "Y888P    "Y888P
     d88P      d88P
   .d8P"     .d8P"
`;

export function greetConsole(): void {
  console.log(
    `%c${QUOTE_MARK}%c
   SomeQuote · one quote a day, the same for everyone.
   Today’s, as JSON: ${location.origin}/api/quote/today
`,
    'font-family: monospace; font-weight: bold; line-height: 1.1',
    'font-weight: normal',
  );
}
