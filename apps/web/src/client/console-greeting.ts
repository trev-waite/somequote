const QUOTE_MARK = `
    .d8888b.    .d8888b.
   d88P  Y88b  d88P  Y88b
   888    888  888    888
   Y88b  d888  Y88b  d888
    "Y8888888   "Y8888888
          888         888
        .d88P       .d88P
     .d888P"     .d888P"
   d888P"      d888P"
`;

export function greetConsole(): void {
  console.log(
    `%c${QUOTE_MARK}%c
   SomeQuote · one quote a day, the same for everyone.
   Today’s, as JSON: ${location.origin}/api/quote/today
`,
    'font-weight: bold',
    'font-weight: normal',
  );
}
