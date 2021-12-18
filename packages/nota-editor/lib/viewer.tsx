import React, { useContext, useState, useEffect, useRef } from "react";
import type { SyntaxNode } from "@lezer/common";
import { observer, useLocalObservable } from "mobx-react";
import indentString from "indent-string";
import classNames from "classnames";
import { ErrorBoundary } from "react-error-boundary";
import parserBabel from "prettier/parser-babel";
import prettier from "prettier/standalone";
import { basicSetup, EditorView, EditorState } from "@codemirror/basic-setup";
import { javascript } from "@codemirror/lang-javascript";
import { action, makeAutoObservable, reaction } from "mobx";
import { is_err, is_ok, err, ok, Result, unwrap } from "@wcrichto/nota-common";
import { nota } from "@wcrichto/nota-syntax";
import _ from "lodash";
import nota_imports from "@wcrichto/nota-components/dist/peer-imports";

import type { TranslationResult } from "../bin/server";
import { StateContext } from "./state";
import { theme } from "./editor";

export class ViewerState {
  selected: number = 0;

  constructor() {
    makeAutoObservable(this);
  }
}

export let ViewerStateContext = React.createContext<ViewerState | null>(null);

export let ViewerConfig = observer(() => {
  let viewer_state = useContext(ViewerStateContext)!;
  let options = ["Output", "Generated JS", "Parse tree"];
  return (
    <div className="viewer-config">
      <div>
        {options.map((key, i) => (
          <button
            key={key}
            onClick={action(() => {
              viewer_state.selected = i;
            })}
            className={classNames({ active: viewer_state.selected == i })}
          >
            {key}
          </button>
        ))}
      </div>
    </div>
  );
});

export let Viewer = observer(() => {
  let viewer_state = useContext(ViewerStateContext)!;
  let state = useContext(StateContext)!;
  let ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let el = ref.current;
    if (!el) {
      return;
    }

    let last_scroll = 0;
    el.addEventListener("scroll", _ => {
      let scroll = el!.scrollTop;
      let t = state.translation;
      if (is_ok(t) && scroll > 0) {
        last_scroll = scroll;
      }
    });

    reaction(
      () => [state.translation],
      () => {
        if (el!.scrollTop == 0) {
          el!.scrollTo(0, last_scroll);
        }
      }
    );
  }, [ref]);

  return (
    <div className="viewer" ref={ref}>
      <Inner selected={viewer_state.selected} />
    </div>
  );
});

let ErrorView: React.FC = ({ children }) => <pre className="translate-error">{children}</pre>;

let Inner: React.FC<{ selected: number }> = observer(({ selected }) => {
  let state = useContext(StateContext)!;
  let data = state.translation;

  if (selected == 0) {
    return <OutputView result={data} />;
  } else if (selected == 1) {
    return <JSView result={data} />;
  } else if (selected == 2) {
    return <ParseView />;
  }

  return null;
});

let nota_lang = nota();
let ParseView: React.FC = () => {
  let state = useContext(StateContext)!;
  let tree = nota_lang.language.parser.parse(state.contents);

  let depth = (node: SyntaxNode): number => (node.parent ? 1 + depth(node.parent) : 0);

  let output = "";
  let cursor = tree.cursor();
  do {
    let sub_input = state.contents.slice(cursor.from, cursor.to);
    if (sub_input.length > 30) {
      sub_input = sub_input.slice(0, 12) + "..." + sub_input.slice(-12);
    }
    sub_input = sub_input.replace("\n", "\\n");
    output += indentString(`${cursor.name}: "${sub_input}"`, 2 * depth(cursor.node)) + "\n";
  } while (cursor.next());

  return <pre>{output}</pre>;
};

let JSView: React.FC<{ result: TranslationResult }> = ({ result }) => {
  let ref = useRef<HTMLDivElement>(null);
  let [editor, set_editor] = useState<EditorView | null>(null);

  useEffect(() => {
    if (is_err(result)) {
      return;
    }

    if (!editor) {
      editor = new EditorView({
        state: EditorState.create({
          doc: "",
          extensions: [basicSetup, javascript(), theme, EditorView.editable.of(false)],
        }),
        parent: ref.current!,
      });
      set_editor(editor);
    }

    let js = result.value;
    try {
      js = prettier.format(js, { parser: "babel", plugins: [parserBabel] });
    } catch (e) {
      console.error(e);
    }

    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.toString().length, insert: js },
    });
  }, [result]);

  return (
    <>
      {is_err(result) ? <ErrorView>{result.value.stack}</ErrorView> : null}
      <div ref={ref} />
    </>
  );
};

let nota_require = (path: string): any => {
  if (!(path in nota_imports)) {
    throw `Cannot import ${path}`;
  }
  return nota_imports[path];
};

let execute = (result: TranslationResult): Result<JSX.Element, JSX.Element> => {
  if (is_err(result)) {
    return err(<>{result.value.stack}</>);
  }

  let Doc;
  try {
    let f = new Function(
      "require",
      result.value + `\n; return nota_document.default; //# sourceURL=document.js`
    );
    Doc = f(nota_require);
  } catch (e: any) {
    return err(<>{e.stack}</>);
  }

  return ok(Doc);
};

let OutputView: React.FC<{ result: TranslationResult }> = observer(({ result }) => {
  let last_translation = useLocalObservable<{ t: JSX.Element | null }>(() => ({
    t: null,
  }));

  let Doc = execute(result);

  let errored = false;
  useEffect(
    action(() => {
      if (errored) {
        errored = false;
        return;
      }
      let doc = unwrap(Doc);
      if (doc != last_translation.t) {
        last_translation.t = doc;
      }
    })
  );

  let fallback = (err: JSX.Element) => {
    errored = true;
    return (
      <>
        <ErrorView>{err}</ErrorView>
        {last_translation.t}
      </>
    );
  };

  return (
    <ErrorBoundary
      resetKeys={[result]}
      FallbackComponent={({ error }) => fallback(<>{error.stack}</>)}
    >
      {is_ok(Doc) ? Doc.value : fallback(Doc.value)}
    </ErrorBoundary>
  );
});
