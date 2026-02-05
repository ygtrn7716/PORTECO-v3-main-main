import React from "react";
import Container from "./Container";



interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
  className?: string;
}

export default function Section({ children, className = "", ...props }: SectionProps) {
  return (
    <section className={`py-16 ${className}`} {...props}>
      <Container>{children}</Container>
    </section>
  );
}

