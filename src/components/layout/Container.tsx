import * as React from "react";

type Props = React.HTMLAttributes<HTMLDivElement> & {
  as?: React.ElementType; // << burası düzeldi
};

export default function Container({
  as: Tag = "div",
  className = "",
  ...props
}: Props) {
  const cls = "mx-auto w-full max-w-[1200px] px-4 md:px-6 " + className;
  
  return <Tag className={cls} {...props} />;
}
