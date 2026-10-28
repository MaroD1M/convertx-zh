export const Base = ({ children }: { children?: unknown }) => (
  <html lang="en">
    <body>
      {children}
      <footer>
        <span>Powered by </span>
        <a href="https://github.com/C4illin/ConvertX">ConvertX</a>
      </footer>
    </body>
  </html>
);
