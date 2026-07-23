// Page-level styles for the report route.
//
// The report is rendered inside the app's root layout, which paints a grey app
// canvas and constrains nothing — fine for a workspace, wrong for a document.
// These rules reset the page to white, and add the print stylesheet that turns
// the same markup into the Executive PDF.
//
// Print rules that matter:
//   • Backgrounds print. Without `print-color-adjust: exact` the navy hero and
//     every chart fill come out white and the document loses its structure.
//   • Sections break cleanly. A section header stranded at the foot of a page,
//     or a stat tile split across two, is what makes a print-to-PDF look like an
//     accident rather than a deliverable.
//   • Interactive furniture disappears. A download button in a PDF is noise.

export function ReportStyles() {
  return (
    <style>{`
      body { background: #FFFFFF; }

      @media (max-width: 900px) {
        .report-two-col { grid-template-columns: minmax(0, 1fr) !important; }
        .report-band > div { padding-left: 22px !important; padding-right: 22px !important; }
      }

      @media print {
        @page { size: A4; margin: 14mm 12mm; }

        html, body { background: #FFFFFF !important; }

        *, *::before, *::after {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        .report-no-print { display: none !important; }

        /* Bands are the document's chapters — start each on a fresh page only
           where it earns one, and never orphan its heading. */
        .report-band { break-inside: auto; padding: 0 !important; }
        .report-band > div { padding: 24px 0 !important; max-width: 100% !important; }

        h2, h3, h4 { break-after: avoid; }
        figure, table, aside { break-inside: avoid; }
        tr { break-inside: avoid; }

        a[href]::after { content: ""; }
      }
    `}</style>
  );
}
