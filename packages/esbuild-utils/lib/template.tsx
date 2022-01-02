import React from "react";

export interface TemplateProps {
  title: string;
  script: string;
}

let Template: React.FC<TemplateProps> = ({ title, script, children }) => (
  <>
    <head>
      <link href="index.css" rel="stylesheet" />
      <meta charSet="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title}</title>
    </head>
    <body className="no-edit">
      {children}
      <script src={script} type="module"></script>
    </body>
  </>
);

export default Template;