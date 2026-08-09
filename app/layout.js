import "katex/dist/katex.min.css";
import "./globals.css";
import AuthHeader from "./AuthHeader";

export const metadata = {
  title: "ฝึกฟิสิกส์",
  description: "AI ติวโจทย์ฟิสิกส์ทีละ step",
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body>
        <AuthHeader />
        {children}
      </body>
    </html>
  );
}
