export default function WidgetLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>{`
          * { margin: 0; padding: 0; box-sizing: border-box; }
          html, body { background: transparent; overflow: hidden; height: 100%; }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
