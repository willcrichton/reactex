import { ExternalTokenizer, ContextTracker } from "@lezer/lr";
//@ts-ignore
import * as terms from "./nota.grammar";
import _ from "lodash";

const [
  lbrc,
  rbrc,
  lparen,
  rparen,
  lbrkt,
  rbrkt,
  at_sign,
  pct_sign,
  hash_sign,
  newline,
  fwdslash,
  backslash,
  pipe,
  eqsign,
] = ["{", "}", "(", ")", "[", "]", "@", "%", "#", "\n", "/", "\\", "|", "="].map(s =>
  s.charCodeAt(0)
);
const eof = -1;

const term_name = (n: number) => Object.keys(terms).find(k => terms[k] == n);

interface IgnoreContext {
  ignore: boolean;
}

interface BalanceContext {
  balance: { [ldelim: string]: number };
}

type Context = (IgnoreContext | BalanceContext) & { parent: any };

const DEBUG = false;

export const dialectContext = new ContextTracker<Context | null>({
  start: null,
  strict: true,
  shift(context, term, _stack, input) {
    if (DEBUG) {
      console.log(
        `shift ${term_name(term)} at ${String.fromCharCode(input.next)} (${
          input.pos
        }) in context ${JSON.stringify(context)}`
      );
    }
    if (term == terms.pct || term == terms.hash || term == terms.at) {
      return { ignore: true, parent: context };
    }
    if (context != null) {
      if (term == terms.lbrc || term == terms.lbrkt) {
        return { balance: _.fromPairs(ldelims.map(l => [l, 0])), parent: context };
      } else if (term == terms.rbrc || term == terms.rbrkt) {
        return context.parent;
      }
    }
    return context;
  },
  reduce(context, term, _stack, input) {
    if (DEBUG) {
      console.log(
        `reduce ${term_name(term)} at ${String.fromCharCode(input.next)} (${
          input.pos
        }) in context ${JSON.stringify(context)}`
      );
    }
    if (context && term == terms.Command) {
      return context.parent;
    }
    return context;
  },
  reuse(context, _node) {
    return context;
  },
  hash(_context) {
    return 0;
  },
});

let delims = [
  [lbrc, rbrc],
  [lbrkt, rbrkt],
  [lparen, rparen],
];
let ldelims = delims.map(([l]) => l);
let rdelims = delims.map(([_l, r]) => r);
let r2l = _.fromPairs(delims.map(([l, r]) => [r, l]));

export const text = new ExternalTokenizer(
  (input, stack) => {
    if (input.next == fwdslash && input.peek(1) == fwdslash) {
      return;
    }

    for (let len = 0; ; len++) {
      // console.log("text", input.pos, String.fromCharCode(input.next), stack.context);
      if (
        input.next == eof ||
        input.next == newline ||
        input.next == hash_sign ||
        input.next == at_sign ||
        input.next == pct_sign
      ) {
        if (len > 0) {
          input.acceptToken(terms.Text);
        }
        return;
      }

      if (stack.context != null) {
        if (
          stack.context.ignore &&
          (input.next == pipe || input.next == eqsign || ldelims.includes(input.next))
        ) {
          if (len > 0) {
            input.acceptToken(terms.Text);
          }
          return;
        } else if (stack.context.balance) {
          if (ldelims.includes(input.next)) {
            stack.context.balance[input.next]++;
          } else if (rdelims.includes(input.next)) {
            let l = r2l[input.next];
            if (stack.context.balance[l] == 0) {
              if (len > 0) {
                input.acceptToken(terms.Text);
              }
              return;
            } else {
              stack.context.balance[l]--;
            }
          }
        }
      }

      if (input.next == backslash) {
        input.advance();
        if (input.next == hash_sign || input.next == at_sign || input.next == pct_sign) {
          len += 1;
          input.advance();
        }
      } else {
        input.advance();
      }
    }
  },
  { contextual: true }
);

export const verbatim = new ExternalTokenizer(input => {
  let saw_brace = false;
  while (input.next != eof) {
    // console.log("verbatim", input.pos, String.fromCharCode(input.next));
    if (input.next == rbrc) {
      saw_brace = true;
    } else if (input.next == pipe && saw_brace) {
      input.acceptToken(terms.VerbatimText, -1);
      return;
    } else {
      saw_brace = false;
    }

    input.advance();
  }
});

export const js = new ExternalTokenizer(input => {
  let balance = _.fromPairs(ldelims.map(l => [l, 0]));
  while (input.next != eof) {
    if (ldelims.includes(input.next)) {
      balance[input.next]++;
    } else if (rdelims.includes(input.next)) {
      let l = r2l[input.next];
      if (balance[l] == 0) {
        input.acceptToken(terms.Js);
        return;
      } else {
        balance[l]--;
      }
    }

    input.advance();
  }
});
