"use client";

import katex from "katex";

// แสดงข้อความที่มีสมการ — สมการอยู่ในเครื่องหมาย $...$ (จะเรนเดอร์ด้วย KaTeX)
// ส่วนที่เป็นข้อความไทย/ปกติ แสดงตามเดิม
export default function MathText({ children }) {
  const text = String(children ?? "");
  const parts = text.split(/(\$[^$]*\$)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.length >= 2 && part.startsWith("$") && part.endsWith("$")) {
          const tex = part.slice(1, -1);
          let html;
          try {
            html = katex.renderToString(tex, {
              throwOnError: false,
              output: "html",
            });
          } catch {
            return <span key={i}>{tex}</span>;
          }
          return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
