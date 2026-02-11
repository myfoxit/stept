import { type JSONContent, Extension } from '@tiptap/core';
import {
  Packer,
  Document,
  LevelFormat,
  Paragraph,
  Table,
  AlignmentType,
  HeadingLevel,
  TextRun,
  ImageRun,
  Math,
  MathRun,
  MathFraction,
  MathRadical,
  MathSubScript,
  MathSubSuperScript,
  MathSuperScript,
  BuilderElement,
  ExternalHyperlink,
  HighlightColor,
  ShadingType,
  UnderlineType,
  Run,
  BorderStyle,
  convertInchesToTwip,
  TableLayoutType,
  TableRow,
  WidthType,
  TableCell,
  Header,
  Footer, // Added Footer, as it was missing in the minified `convertFooter`
  type IStylesOptions,
  type IParagraphOptions,
} from 'docx';

// Export all docx components for external use
import * as docx from 'docx';
export { docx as Docx };

// --- Type Definitions (Inferred from code) ---

interface Mark {
  type: string;
  attrs?: { [key: string]: any };
}

interface Node extends JSONContent {
  marks?: Mark[];
}

interface CustomNode {
  type: string;
  render: (node: Node) => Paragraph | Paragraph[] | Table | TextRun | null;
}

interface ImageDimensions {
  width: number;
  height: number;
}

interface ConvertConfig {
  node: Node;
  customNodes?: CustomNode[];
  styleOverrides?: IStylesOptions;
  pageSize?: {
    width?: string;
    height?: string;
  };
  pageMargins?: {
    top?: string;
    bottom?: string;
    left?: string;
    right?: string;
  };
  headers?: {
    evenAndOddHeaders?: boolean;
    default?: Header | (() => Promise<Header>);
    first?: Header | (() => Promise<Header>);
    even?: Header | (() => Promise<Header>);
  };
  footers?: {
    evenAndOddFooters?: boolean;
    default?: Footer | (() => Promise<Footer>);
    first?: Footer | (() => Promise<Footer>);
    even?: Footer | (() => Promise<Footer>);
  };
}

interface ConvertExtensions {
  id: string;
  [key: symbol]: unknown;
}

type ExportDocxOptions = {
  document: JSONContent;
  exportType: 'buffer' | 'string' | 'base64' | 'blob' | 'stream';
  customNodes: CustomNode[];
  styleOverrides: IStylesOptions;
  pageSize?: ConvertConfig['pageSize'];
  pageMargins?: ConvertConfig['pageMargins'];
  headers?: ConvertConfig['headers'];
  footers?: ConvertConfig['footers'];
  extensions?: ConvertExtensions[];
};

type TiptapExportDocxOptions = Omit<
  ExportDocxOptions,
  'document' | 'extensions'
> & {
  onCompleteExport: (result: any) => void;
};

// --- Constants ---

const EXPORT_DOCX_HEADER_FOOTER_KEY = Symbol('export-docx-header-footer-key');

/**
 * Converts a line height value (e.g., 1.15) to DOCX's line spacing format (240ths of a line).
 */
export function lineHeightToDocx(lineHeight: number): number {
  return lineHeight * 240;
}

/**
 * Converts points (pt) to half-points (docx font size unit).
 */
export function pointsToHalfPoints(points: number): number {
  return points * 2;
}

/**
 * Converts points (pt) to twips (docx spacing unit). 1pt = 20 twips.
 */
export function pointsToTwips(points: number): number {
  return points * 20;
}

const defaultStyles: IStylesOptions = {
  paragraphStyles: [
    {
      id: 'Normal',
      name: 'Normal',
      run: { font: 'Aptos', size: pointsToHalfPoints(11) },
      paragraph: {
        spacing: {
          before: 0,
          after: pointsToTwips(10),
          line: lineHeightToDocx(1.15),
        },
      },
    },
    {
      id: 'ListParagraph',
      name: 'List Paragraph',
      basedOn: 'Normal',
      quickFormat: true,
      run: { font: 'Aptos', size: pointsToHalfPoints(11) },
      paragraph: {
        spacing: {
          before: 0,
          after: pointsToTwips(2),
          line: lineHeightToDocx(1),
        },
      },
    },
    {
      id: 'Heading1',
      name: 'Heading 1',
      basedOn: 'Normal',
      next: 'Normal',
      quickFormat: true,
      run: {
        font: 'Aptos Light',
        size: pointsToHalfPoints(16),
        bold: true,
        color: '2E74B5',
      },
      paragraph: {
        spacing: {
          before: pointsToTwips(12),
          after: pointsToTwips(6),
          line: lineHeightToDocx(1.15),
        },
      },
    },
    {
      id: 'Heading2',
      name: 'Heading 2',
      basedOn: 'Normal',
      next: 'Normal',
      quickFormat: true,
      run: {
        font: 'Aptos Light',
        size: pointsToHalfPoints(14),
        bold: true,
        color: '2E74B5',
      },
      paragraph: {
        spacing: {
          before: pointsToTwips(12),
          after: pointsToTwips(6),
          line: lineHeightToDocx(1.15),
        },
      },
    },
    {
      id: 'Heading3',
      name: 'Heading 3',
      basedOn: 'Normal',
      next: 'Normal',
      quickFormat: true,
      run: {
        font: 'Aptos',
        size: pointsToHalfPoints(13),
        bold: true,
        color: '2E74B5',
      },
      paragraph: {
        spacing: {
          before: pointsToTwips(12),
          after: pointsToTwips(6),
          line: lineHeightToDocx(1.15),
        },
      },
    },
    {
      id: 'Heading4',
      name: 'Heading 4',
      basedOn: 'Normal',
      next: 'Normal',
      quickFormat: true,
      run: {
        font: 'Aptos',
        size: pointsToHalfPoints(12),
        bold: true,
        color: '2E74B5',
      },
      paragraph: {
        spacing: {
          before: pointsToTwips(12),
          after: pointsToTwips(6),
          line: lineHeightToDocx(1.15),
        },
      },
    },
    {
      id: 'Heading5',
      name: 'Heading 5',
      basedOn: 'Normal',
      next: 'Normal',
      quickFormat: true,
      run: {
        font: 'Aptos',
        size: pointsToHalfPoints(11),
        bold: true,
        color: '2E74B5',
      },
      paragraph: {
        spacing: {
          before: pointsToTwips(12),
          after: pointsToTwips(6),
          line: lineHeightToDocx(1.15),
        },
      },
    },
    {
      id: 'Title',
      name: 'Title',
      basedOn: 'Normal',
      next: 'Normal',
      quickFormat: true,
      run: {
        font: 'Aptos Light',
        size: pointsToHalfPoints(22),
        bold: true,
        color: '000000',
      },
      paragraph: {
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0, line: lineHeightToDocx(1.15) },
      },
    },
    {
      id: 'Subtitle',
      name: 'Subtitle',
      basedOn: 'Normal',
      next: 'Normal',
      quickFormat: true,
      run: {
        font: 'Aptos Light',
        size: pointsToHalfPoints(16),
        italics: true,
        color: '666666',
      },
      paragraph: {
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0, line: lineHeightToDocx(1.15) },
      },
    },
    {
      id: 'Quote',
      name: 'Quote',
      basedOn: 'Normal',
      quickFormat: true,
      run: { font: 'Aptos', italics: true },
      paragraph: {
        alignment: AlignmentType.CENTER,
        spacing: {
          before: pointsToTwips(10),
          after: pointsToTwips(10),
          line: lineHeightToDocx(1.15),
        },
      },
    },
    {
      id: 'IntenseQuote',
      name: 'Intense Quote',
      basedOn: 'Normal',
      quickFormat: true,
      run: { font: 'Aptos', italics: true, color: '444444' },
      paragraph: {
        alignment: AlignmentType.CENTER,
        spacing: {
          before: pointsToTwips(10),
          after: pointsToTwips(10),
          line: lineHeightToDocx(1.15),
        },
      },
    },
    {
      id: 'NoSpacing',
      name: 'No Spacing',
      basedOn: 'Normal',
      quickFormat: true,
      paragraph: {
        spacing: { before: 0, after: 0, line: lineHeightToDocx(1) },
      },
    },
    {
      id: 'Hyperlink',
      name: 'Hyperlink',
      basedOn: 'Normal',
      run: { color: '0563C1', underline: { type: 'single' } },
    },
  ],
};

const DEFAULT_IMAGE_DIMENSIONS: ImageDimensions = { width: 800, height: 400 };

// --- Image Handling ---

/**
 * Gets image dimensions in a browser environment.
 */
async function getImageDimensionsBrowser(
  buffer: Uint8Array
): Promise<ImageDimensions> {
  let decoder = new TextDecoder('utf-8');
  let magic = decoder.decode(buffer.subarray(0, 100));
  let type = 'image/png';

  if (magic.includes('<svg')) {
    type = 'image/svg+xml';
  } else if (magic.startsWith('\x89PNG')) {
    type = 'image/png';
  } else if (magic.startsWith('\xFF\xD8')) {
    type = 'image/jpeg';
  }

  return new Promise((resolve, reject) => {
    let blob = new Blob([buffer], { type: type });
    let url = URL.createObjectURL(blob);
    let img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

/**
 * Gets image dimensions in a server (Node.js) environment.
 */
async function getImageDimensionsServer(
  buffer: Buffer
): Promise<ImageDimensions> {
  try {
    // Dynamically import 'image-size' to avoid browser bundling issues
    let { imageSize } = await import('image-size');
    let dimensions = imageSize(buffer);
    if (dimensions.width && dimensions.height) {
      return { width: dimensions.width, height: dimensions.height };
    }
  } catch (error) {
    console.warn('Error getting server-side image dimensions:', error);
  }
  return DEFAULT_IMAGE_DIMENSIONS;
}

const SUPPORTED_IMAGE_TYPES = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg'];

/**
 * Determines the image type from response headers or URL.
 */
function getImageType(url: string, headers: Headers): string {
  let contentType = headers.get('content-type');
  if (contentType) {
    if (contentType.includes('png')) return 'png';
    if (contentType.includes('jpeg') || contentType.includes('jpg'))
      return 'jpg';
    if (contentType.includes('gif')) return 'gif';
    if (contentType.includes('bmp')) return 'bmp';
    if (contentType.includes('svg')) return 'svg';
  }

  // Fallback for octet-stream
  if (contentType === 'binary/octet-stream') {
    let urlObj = new URL(url);
    let filename = urlObj.pathname.substring(
      urlObj.pathname.lastIndexOf('/') + 1
    );
    let extension = filename
      .substring(filename.lastIndexOf('.') + 1)
      .toLowerCase();
    if (SUPPORTED_IMAGE_TYPES.includes(extension)) {
      return extension;
    }
  }

  throw new Error(
    `Unsupported image type [${contentType}]. Only ${SUPPORTED_IMAGE_TYPES.join(
      ', '
    )} are supported.`
  );
}

/**
 * Converts pixels to points (1px = 0.75pt).
 */
export function pixelsToPoints(pixels: number): number {
  return pixels * 0.75;
}

/**
 * Gets image dimensions, delegating to the appropriate environment-specific function.
 */
async function getImageDimensions(
  buffer: Uint8Array | Buffer
): Promise<ImageDimensions> {
  try {
    if (typeof window !== 'undefined') {
      return await getImageDimensionsBrowser(buffer as Uint8Array);
    } else {
      return await getImageDimensionsServer(buffer as Buffer);
    }
  } catch (error) {
    console.warn(
      'Could not determine image dimensions, using defaults:',
      error
    );
    return { width: 800, height: 400 };
  }
}

/**
 * Converts a Tiptap image node to a DOCX Paragraph containing an ImageRun.
 */
export async function convertImage({
  node,
}: {
  node: Node;
}): Promise<Paragraph> {
  let src = node.attrs?.src;
  if (!src) {
    throw new Error('Image node missing src attribute.');
  }

  let response = await fetch(src);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch image from ${src}: ${response.statusText}`
    );
  }

  let arrayBuffer = await response.arrayBuffer();
  // Use Buffer in Node.js, Uint8Array in browser
  let buffer =
    typeof Buffer !== 'undefined' && typeof Buffer.from === 'function'
      ? Buffer.from(arrayBuffer)
      : new Uint8Array(arrayBuffer);

  let imageType = getImageType(src, response.headers);
  let intrinsicDimensions: ImageDimensions = { width: 800, height: 400 };
  try {
    intrinsicDimensions = await getImageDimensions(buffer);
  } catch (error) {
    console.warn(
      'Could not determine intrinsic dimensions, using defaults.',
      error
    );
  }

  let widthInPoints = pixelsToPoints(intrinsicDimensions.width);
  let heightInPoints = pixelsToPoints(intrinsicDimensions.height);

  let imageRunProperties: any;
  if (imageType === 'svg') {
    // SVG requires a fallback image
    imageRunProperties = {
      data: buffer,
      transformation: { width: widthInPoints, height: heightInPoints },
      type: imageType,
      fallback: { type: 'jpg', data: '' }, // Fallback data is empty
    };
  } else {
    imageRunProperties = {
      data: buffer,
      transformation: { width: widthInPoints, height: heightInPoints },
      type: imageType,
    };
  }

  let imageRun = new ImageRun(imageRunProperties);
  return new Paragraph({ children: [imageRun] });
}

// --- Math (LaTeX) Handling ---

/**
 * Creates properties for a Math Matrix (m:mPr).
 */
const createMatrixProperties = (options: {
  columnCount: number;
  columnAlignment?: string;
}) => {
  let { columnCount, columnAlignment = 'center' } = options;
  let properties = new BuilderElement({
    name: 'm:mcPr',
    children: [
      new BuilderElement({
        name: 'm:count',
        attributes: { val: { key: 'm:val', value: columnCount.toString() } },
      }),
      new BuilderElement({
        name: 'm:mcJc',
        attributes: { val: { key: 'm:val', value: columnAlignment } },
      }),
    ],
  });
  let columnContainer = new BuilderElement({
    name: 'm:mc',
    children: [properties],
  });
  let matrixColumns = new BuilderElement({
    name: 'm:mcs',
    children: [columnContainer],
  });

  let runProperties = new BuilderElement({
    name: 'w:rPr',
    children: [
      new BuilderElement({
        name: 'w:rFonts',
        attributes: {
          ascii: { key: 'w:ascii', value: 'Cambria Math' },
          hAnsi: { key: 'w:hAnsi', value: 'Cambria Math' },
        },
      }),
      new BuilderElement({ name: 'w:i' }),
    ],
  });
  let controlProperties = new BuilderElement({
    name: 'm:ctrlPr',
    children: [runProperties],
  });

  return new BuilderElement({
    name: 'm:mPr',
    children: [matrixColumns, controlProperties],
  });
};

/**
 * Wraps math components in a Math Element (m:e).
 */
const createMathElement = (children: any[]) =>
  new BuilderElement({ name: 'm:e', children: children });

/**
 * Creates a Math Matrix Row (m:mr).
 */
const createMatrixRow = (row: { cells: any[][] }) => {
  let cells = row.cells.map((cellContent) => createMathElement(cellContent));
  return new BuilderElement({ name: 'm:mr', children: cells });
};

/**
 * Creates a Math Matrix (m:m).
 */
const createMatrix = (options: {
  rows: { cells: any[][] }[];
  columnCount: number;
  columnAlignment?: string;
}) => {
  let { rows, columnCount, columnAlignment } = options;
  let matrixProperties = createMatrixProperties({
    columnCount,
    columnAlignment,
  });
  let matrixRows = rows.map((row) => createMatrixRow(row));
  return new BuilderElement({
    name: 'm:m',
    children: [matrixProperties, ...matrixRows],
  });
};

/**
 * Mapping of LaTeX commands to their Unicode or string equivalents.
 */
const latexSymbols: { [key: string]: string } = {
  '\\sin': 'sin',
  '\\cos': 'cos',
  '\\tan': 'tan',
  '\\sec': 'sec',
  '\\csc': 'csc',
  '\\cot': 'cot',
  '\\sinh': 'sinh',
  '\\cosh': 'cosh',
  '\\tanh': 'tanh',
  '\\sech': 'sech',
  '\\csch': 'csch',
  '\\coth': 'coth',
  '\\arcsin': 'arcsin',
  '\\arccos': 'arccos',
  '\\arctan': 'arctan',
  '\\arcsec': 'arcsec',
  '\\arccsc': 'arccsc',
  '\\arccot': 'arccot',
  '\\log': 'log',
  '\\ln': 'ln',
  '\\sum': '\u2211',
  '\\int': '\u222B',
  '\\oint': '\u222E',
  '\\iint': '\u222C',
  '\\iiint': '\u222D',
  '\\prod': '\u220F',
  '\\coprod': '\u2210',
  '\\lim': 'lim',
  '\\limsup': 'lim sup',
  '\\liminf': 'lim inf',
  '\\max': 'max',
  '\\min': 'min',
  '\\sup': 'sup',
  '\\inf': 'inf',
  '\\arg': 'arg',
  '\\ker': 'ker',
  '\\dim': 'dim',
  '\\hom': 'hom',
  '\\det': 'det',
  '\\exp': 'exp',
  '\\deg': 'deg',
  '\\gcd': 'gcd',
  '\\lcm': 'lcm',
  '\\alpha': '\u03B1',
  '\\beta': '\u03B2',
  '\\gamma': '\u03B3',
  '\\delta': '\u03B4',
  '\\epsilon': '\u03B5',
  '\\varepsilon': '\u03B5',
  '\\zeta': '\u03B6',
  '\\eta': '\u03B7',
  '\\theta': '\u03B8',
  '\\vartheta': '\u03D1',
  '\\iota': '\u03B9',
  '\\kappa': '\u03BA',
  '\\lambda': '\u03BB',
  '\\mu': '\u03BC',
  '\\nu': '\u03BD',
  '\\xi': '\u03BE',
  '\\omicron': '\u03BF',
  '\\pi': '\u03C0',
  '\\varpi': '\u03D6',
  '\\rho': '\u03C1',
  '\\varrho': '\u03F1',
  '\\sigma': '\u03C3',
  '\\varsigma': '\u03C2',
  '\\tau': '\u03C4',
  '\\upsilon': '\u03C5',
  '\\phi': '\u03C6',
  '\\varphi': '\u03C6',
  '\\chi': '\u03C7',
  '\\psi': '\u03C8',
  '\\omega': '\u03C9',
  '\\Alpha': '\u0391',
  '\\Beta': '\u0392',
  '\\Gamma': '\u0393',
  '\\Delta': '\u0394',
  '\\Epsilon': '\u0395',
  '\\Zeta': '\u0396',
  '\\Eta': '\u0397',
  '\\Theta': '\u0398',
  '\\Iota': '\u0399',
  '\\Kappa': '\u039A',
  '\\Lambda': '\u039B',
  '\\Mu': '\u039C',
  '\\Nu': '\u039D',
  '\\Xi': '\u039E',
  '\\Omicron': '\u039F',
  '\\Pi': '\u03A0',
  '\\Rho': '\u03A1',
  '\\Sigma': '\u03A3',
  '\\Tau': '\u03A4',
  '\\Upsilon': '\u03A5',
  '\\Phi': '\u03A6',
  '\\Chi': '\u03A7',
  '\\Psi': '\u03A8',
  '\\Omega': '\u03A9',
  '\\infty': '\u221E',
  '\\pm': '\xB1',
  '\\mp': '\u2213',
  '\\cdot': '\u22C5',
  '\\times': '\xD7',
  '\\div': '\xF7',
  '\\setminus': '\u2216',
  '\\backslash': '\u2216',
  '\\partial': '\u2202',
  '\\nabla': '\u2207',
  '\\triangle': '\u25B3',
  '\\square': '\u25A1',
  '\\blacksquare': '\u25A0',
  '\\diamond': '\u25CA',
  '\\blackdiamond': '\u25C6',
  '\\emptyset': '\u2205',
  '\\varnothing': '\u2205',
  '\\leq': '\u2264',
  '\\le': '\u2264',
  '\\geq': '\u2265',
  '\\ge': '\u2265',
  '\\neq': '\u2260',
  '\\ne': '\u2260',
  '\\ll': '\u226A',
  '\\gg': '\u226B',
  '\\lll': '\u22D8',
  '\\ggg': '\u22D9',
  '\\approx': '\u2248',
  '\\simeq': '\u2243',
  '\\cong': '\u2245',
  '\\equiv': '\u2261',
  '\\sim': '\u223C',
  '\\propto': '\u221D',
  '\\prec': '\u227A',
  '\\succ': '\u227B',
  '\\preceq': '\u2AAF',
  '\\succeq': '\u2AB0',
  '\\parallel': '\u2225',
  '\\perp': '\u22A5',
  '\\mid': '\u2223',
  '\\nmid': '\u2224',
  '\\sub': '\u2282',
  '\\cup': '\u222A',
  '\\cap': '\u2229',
  '\\subset': '\u2282',
  '\\supset': '\u2283',
  '\\subseteq': '\u2286',
  '\\supseteq': '\u2287',
  '\\subsetneq': '\u228A',
  '\\supsetneq': '\u228B',
  '\\in': '\u2208',
  '\\notin': '\u2209',
  '\\ni': '\u220B',
  '\\owns': '\u220B',
  '\\notni': '\u220C',
  '\\sqsubset': '\u228F',
  '\\sqsupset': '\u2290',
  '\\sqsubseteq': '\u2291',
  '\\sqsupseteq': '\u2292',
  '\\bigcup': '\u22C3',
  '\\bigcap': '\u22C2',
  '\\bigsqcup': '\u2294',
  '\\exists': '\u2203',
  '\\forall': '\u2200',
  '\\neg': '\xAC',
  '\\land': '\u2227',
  '\\lor': '\u2228',
  '\\lnot': '\xAC',
  '\\top': '\u22A4',
  '\\bot': '\u22A5',
  '\\vdash': '\u22A2',
  '\\models': '\u22A8',
  '\\leftarrow': '\u2190',
  '\\gets': '\u2190',
  '\\rightarrow': '\u2192',
  '\\to': '\u2192',
  '\\leftrightarrow': '\u2194',
  '\\uparrow': '\u2191',
  '\\downarrow': '\u2193',
  '\\updownarrow': '\u2195',
  '\\Leftarrow': '\u21D0',
  '\\Rightarrow': '\u21D2',
  '\\implies': '\u21D2',
  '\\Leftrightarrow': '\u21D4',
  '\\iff': '\u21D4',
  '\\Uparrow': '\u21D1',
  '\\Downarrow': '\u21D3',
  '\\Updownarrow': '\u21D5',
  '\\mapsto': '\u21A6',
  '\\longmapsto': '\u27FC',
  '\\hookleftarrow': '\u21A9',
  '\\hookrightarrow': '\u21AA',
  '\\leftharpoonup': '\u21BC',
  '\\rightharpoonup': '\u21C0',
  '\\leftharpoondown': '\u21BD',
  '\\rightharpoondown': '\u21C1',
  '\\rightleftharpoons': '\u21CC',
  '\\overleftarrow': '\u2190',
  '\\overrightarrow': '\u2192',
  '\\overleftrightarrow': '\u2194',
  '\\from': '\u2190',
  '\\ast': '\u2217',
  '\\star': '\u22C6',
  '\\circ': '\u2218',
  '\\bullet': '\u2022',
  '\\dot': '\u02D9',
  '\\ddot': '\xA8',
  '\\tilde': '~',
  '\\bar': '\xAF',
  '\\hat': '^',
  '\\check': '\u02C7',
  '\\acute': '\xB4',
  '\\grave': '`',
  '\\overline': '\xAF',
  '\\underline': '\xAF',
  '\\overbrace': '\u23DE',
  '\\underbrace': '\u23DF',
  '\\sqrt': '\u221A',
  '\\mathbb{N}': '\u2115',
  '\\mathbb{Z}': '\u2124',
  '\\mathbb{Q}': '\u211A',
  '\\mathbb{R}': '\u211D',
  '\\mathbb{C}': '\u2102',
  '\\mathbb{H}': '\u210D',
  '\\mathbb{P}': '\u2119',
  '\\mathbb{E}': 'E',
  '\\lfloor': '\u230A',
  '\\rfloor': '\u230B',
  '\\lceil': '\u2308',
  '\\rceil': '\u2309',
  '\\langle': '\u27E8',
  '\\rangle': '\u27E9',
  '\\lbrace': '{',
  '\\rbrace': '}',
  '\\lvert': '|',
  '\\rvert': '|',
  '\\lVert': '\u2016',
  '\\rVert': '\u2016',
  '\\angle': '\u2220',
  '\\measuredangle': '\u2221',
  '\\sphericalangle': '\u2222',
  '\\therefore': '\u2234',
  '\\because': '\u2235',
  '\\QED': '\u220E',
  '\\boxtimes': '\u22A0',
  '\\boxplus': '\u229E',
  '\\boxminus': '\u229F',
  '\\boxdot': '\u22A1',
  '\\bmod': 'mod',
  '\\pmod': 'mod',
  '\\mod': 'mod',
  '\\Re': '\u211C',
  '\\Im': '\u2111',
  '\\wp': '\u2118',
  '\\ell': '\u2113',
  '\\hbar': '\u210F',
  '\\mho': '\u2127',
  '\\Finv': '\u2132',
  '\\Game': '\u2141',
  '\\Bbbk': '\u{1D55C}',
  '\\vec': '\u20D7',
  '\\mathring': '\u02DA',
};

/**
 * A simple LaTeX parser to convert LaTeX strings into docx Math components.
 */
function parseLatex(latex: string): any[] {
  let components: any[] = [];
  let remainingLatex = latex.trim().replace(/\\\\/g, '\\'); // Handle escaped backslashes

  while (remainingLatex.length > 0) {
    let matched = false;

    // Match \sqrt[degree]{radicand}
    let match = remainingLatex.match(/^\\sqrt\[([^\]]*)\]\{([^}]*)\}/);
    if (match) {
      let degree = match[1];
      let radicand = match[2];
      let degreeComponents = parseLatex(degree);
      let radicandComponents = parseLatex(radicand);
      components.push(
        new MathRadical({
          children: radicandComponents,
          degree: degreeComponents,
        })
      );
      remainingLatex = remainingLatex.slice(match[0].length);
      matched = true;
    }

    // Match \sqrt{radicand}
    if (!matched) {
      match = remainingLatex.match(/^\\sqrt\{([^}]*)\}/);
      if (match) {
        let radicand = match[1];
        let radicandComponents = parseLatex(radicand);
        components.push(new MathRadical({ children: radicandComponents }));
        remainingLatex = remainingLatex.slice(match[0].length);
        matched = true;
      }
    }

    // Match \frac{numerator}{denominator}
    if (!matched) {
      match = remainingLatex.match(/^\\frac\{([^}]*)\}\{([^}]*)\}/);
      if (match) {
        let numeratorComponents = parseLatex(match[1]);
        let denominatorComponents = parseLatex(match[2]);
        components.push(
          new MathFraction({
            numerator: numeratorComponents,
            denominator: denominatorComponents,
          })
        );
        remainingLatex = remainingLatex.slice(match[0].length);
        matched = true;
      }
    }

    // Match \binom{n}{k}
    if (!matched) {
      match = remainingLatex.match(/^\\binom\{([^}]*)\}\{([^}]*)\}/);
      if (match) {
        let nComponents = parseLatex(match[1]);
        let kComponents = parseLatex(match[2]);
        components.push(new MathRun('('));
        components.push(
          new MathFraction({ numerator: nComponents, denominator: kComponents })
        );
        components.push(new MathRun(')'));
        remainingLatex = remainingLatex.slice(match[0].length);
        matched = true;
      }
    }

    // Match symbols from the map
    if (!matched) {
      for (let [command, symbol] of Object.entries(latexSymbols)) {
        if (remainingLatex.startsWith(command)) {
          components.push(new MathRun(symbol));
          remainingLatex = remainingLatex.slice(command.length);
          matched = true;
          break;
        }
      }
    }

    // Match subscript/superscript (e.g., _...^... or ^..._...)
    if (!matched) {
      match =
        remainingLatex.match(/^_(\{[^}]*\}|.)\^(\{[^}]*\}|.)/) ||
        remainingLatex.match(/^\^(\{[^}]*\}|.)_(\{[^}]*\}|.)/);
      if (match) {
        if (components.length === 0) {
          components.push(new MathRun('')); // Base for script
        }
        let base = components.pop();
        let sub, sup;
        if (remainingLatex.startsWith('_')) {
          sub = match[1].startsWith('{') ? match[1].slice(1, -1) : match[1];
          sup = match[2].startsWith('{') ? match[2].slice(1, -1) : match[2];
        } else {
          sup = match[1].startsWith('{') ? match[1].slice(1, -1) : match[1];
          sub = match[2].startsWith('{') ? match[2].slice(1, -1) : match[2];
        }
        let subComponents = parseLatex(sub);
        let supComponents = parseLatex(sup);
        components.push(
          new MathSubSuperScript({
            children: [base],
            subScript: subComponents,
            superScript: supComponents,
          })
        );
        remainingLatex = remainingLatex.slice(match[0].length);
        matched = true;
      }
    }

    // Match superscript (e.g., ^...)
    if (!matched) {
      match = remainingLatex.match(/^\^(\{[^}]*\}|.)/);
      if (match) {
        if (components.length === 0) {
          components.push(new MathRun('')); // Base for script
        }
        let base = components.pop();
        let sup = match[1].startsWith('{') ? match[1].slice(1, -1) : match[1];
        let supComponents = parseLatex(sup);
        components.push(
          new MathSuperScript({ children: [base], superScript: supComponents })
        );
        remainingLatex = remainingLatex.slice(match[0].length);
        matched = true;
      }
    }

    // Match subscript (e.g., _...)
    if (!matched) {
      match = remainingLatex.match(/^_(\{[^}]*\}|.)/);
      if (match) {
        if (components.length === 0) {
          components.push(new MathRun('')); // Base for script
        }
        let base = components.pop();
        let sub = match[1].startsWith('{') ? match[1].slice(1, -1) : match[1];
        let subComponents = parseLatex(sub);
        components.push(
          new MathSubScript({ children: [base], subScript: subComponents })
        );
        remainingLatex = remainingLatex.slice(match[0].length);
        matched = true;
      }
    }

    // Match \left and \right delimiters
    if (!matched) {
      match = remainingLatex.match(/^\\(left|right)(.?)/);
      if (match) {
        // Add the delimiter if it's not a special char
        if (match[2] && match[2] !== '\\' && match[2] !== '.') {
          components.push(new MathRun(match[2]));
        }
        remainingLatex = remainingLatex.slice(match[0].length);
        matched = true;
      }
    }

    // Match matrix environment
    if (!matched) {
      match = remainingLatex.match(
        /^\\begin\{matrix\}([\s\S]*?)\\end\{matrix\}/
      );
      if (match) {
        let matrixContent = match[1];
        let rows = matrixContent
          .split(/\\\\|\\(?=[0-9&])/)
          .filter((row) => row.trim())
          .map((rowStr) => ({
            cells: rowStr
              .split('&')
              .map((cellStr) => cellStr.trim())
              .map((cell) => (cell ? parseLatex(cell) : [new MathRun('')])),
          }));
        let columnCount = rows.length > 0 ? rows[0].cells.length : 1;
        let matrix = createMatrix({
          rows,
          columnCount,
          columnAlignment: 'center',
        });
        components.push(matrix);
        remainingLatex = remainingLatex.slice(match[0].length);
        matched = true;
      }
    }

    // Consume other \begin{} and \end{} environments
    if (!matched) {
      match = remainingLatex.match(/^\\begin\{[^}]*\}/);
      if (match) {
        remainingLatex = remainingLatex.slice(match[0].length);
        matched = true;
      }
    }
    if (!matched) {
      match = remainingLatex.match(/^\\end\{[^}]*\}/);
      if (match) {
        remainingLatex = remainingLatex.slice(match[0].length);
        matched = true;
      }
    }

    // Match \text{...}
    if (!matched) {
      match = remainingLatex.match(/^\\text\{([^}]*)\}/);
      if (match) {
        components.push(new MathRun(match[1]));
        remainingLatex = remainingLatex.slice(match[0].length);
        matched = true;
      }
    }

    // Handle matrix cell/row separators
    if (
      !matched &&
      (remainingLatex.startsWith('&') || remainingLatex.startsWith('\\\\'))
    ) {
      if (remainingLatex.startsWith('&')) {
        components.push(new MathRun(' ')); // Placeholder
        remainingLatex = remainingLatex.slice(1);
      } else {
        components.push(new MathRun(' ')); // Placeholder
        remainingLatex = remainingLatex.slice(2);
      }
      matched = true;
    }

    // Match unknown commands as text
    if (!matched) {
      match = remainingLatex.match(/^\\([a-zA-Z]+)/);
      if (match) {
        components.push(new MathRun(match[1]));
        remainingLatex = remainingLatex.slice(match[0].length);
        matched = true;
      }
    }

    // Match plain text
    if (!matched) {
      match = remainingLatex.match(/^[^\\^_]+/);
      if (match) {
        components.push(new MathRun(match[0]));
        remainingLatex = remainingLatex.slice(match[0].length);
        matched = true;
      }
    }

    // Fallback: consume one char
    if (!matched) {
      components.push(new MathRun(remainingLatex.charAt(0)));
      remainingLatex = remainingLatex.slice(1);
      matched = true;
    }
  }

  // Return components, or the original string as a fallback
  return components.length > 0 ? components : [new MathRun(latex)];
}

/**
 * Converts an inline math node to a docx Math object.
 */
export function convertInlineMath(node: Node): Math | null {
  if (!node.attrs?.latex) {
    return null;
  }
  let latex = node.attrs.latex;
  try {
    let mathComponents = parseLatex(latex);
    return new Math({ children: mathComponents });
  } catch (e) {
    // Fallback to a simple MathRun
    return new Math({ children: [new MathRun(latex)] });
  }
}

/**
 * Converts a block math node to a docx Paragraph containing a Math object.
 */
export function convertBlockMath({ node }: { node: Node }): Paragraph | null {
  console.log('convertBlockMath', node);
  if (!node.attrs?.latex) {
    return null;
  }
  let latex = node.attrs.latex;
  try {
    let mathComponents = parseLatex(latex);
    console.log('mathComponents', mathComponents);
    return new Paragraph({
      children: [new Math({ children: mathComponents })],
    });
  } catch (e) {
    // Fallback to a simple MathRun inside a Paragraph
    return new Paragraph({
      children: [new Math({ children: [new MathRun(latex)] })],
    });
  }
}

// --- Text and Mark Handling ---

/**
 * Converts pixels to half-points (1px = 0.75pt, 1pt = 2 half-points).
 */
export function pixelsToHalfPoints(pixels: number): number {
  return pixels * 0.75 * 2;
}

/**
 * Converts an rgb(r, g, b) string to a hex color string.
 */
function rgbToHex(rgbString: string): string {
  let matches = rgbString.match(/\d+/g);
  if (!matches || matches.length < 3) {
    throw new Error('Invalid RGB input');
  }
  return matches
    .slice(0, 3)
    .map((val) => parseInt(val, 10).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

const colorNameToHex: { [key: string]: string } = {
  black: '000000',
  blue: '0000FF',
  brown: 'A52A2A',
  cyan: '00FFFF',
  gray: '808080',
  green: '00FF00',
  indigo: '4B0082',
  lime: '00FF00',
  magenta: 'FF00FF',
  maroon: '800000',
  navy: '000080',
  olive: '808000',
  orange: 'FFA500',
  pink: 'FFC0CB',
  purple: '800080',
  red: 'FF0000',
  teal: '008080',
  violet: '9400D3',
  white: 'FFFFFF',
  yellow: 'FFFF00',
};

/**
 * Parses a font-family string (e.g., "Arial, sans-serif") and returns the first font.
 */
function parseFontFamily(fontFamilyString: string): string {
  let firstFont = fontFamilyString
    .replace(/"/g, '')
    .split(',')
    .find((font) => font.trim().length > 0);
  return firstFont ? firstFont.trim() : fontFamilyString;
}

/**
 * Checks if a string is a valid HighlightColor enum value.
 */
function isHighlightColor(color: string): color is HighlightColor {
  return Object.values(HighlightColor).includes(color as HighlightColor);
}

/**
 * Converts a Tiptap text node with marks to a docx TextRun or ExternalHyperlink.
 */
export function convertTextNode(node: Node): TextRun | ExternalHyperlink {
  let textRunOptions: any = {};
  let isLink = false;
  let linkAttrs: { href?: string } = {};

  if (node.marks) {
    node.marks.forEach((mark: Mark) => {
      switch (mark.type) {
        case 'bold':
          textRunOptions.bold = true;
          break;
        case 'italic':
          textRunOptions.italics = true;
          break;
        case 'underline':
          textRunOptions.underline = { type: UnderlineType.SINGLE };
          break;
        case 'strike':
          textRunOptions.strike = true;
          break;
        case 'code':
          textRunOptions.font = 'Courier New';
          textRunOptions.shading = { type: 'solid', fill: '5805ff' }; // Note: This color is from minified code
          textRunOptions.style = 'Code'; // Assumes a "Code" style is defined
          break;
        case 'textStyle':
          if (mark.attrs) {
            if (mark.attrs.color && mark.attrs.color !== '') {
              if (mark.attrs.color.startsWith('#')) {
                textRunOptions.color = mark.attrs.color;
              } else if (
                Number.isInteger(Number(mark.attrs.color)) &&
                mark.attrs.color.length === 6
              ) {
                textRunOptions.color = `#${mark.attrs.color}`;
              } else if (
                Number.isInteger(Number(mark.attrs.color)) &&
                mark.attrs.color.length === 3
              ) {
                textRunOptions.color = `#${mark.attrs.color.repeat(2)}`;
              } else if (mark.attrs.color.startsWith('rgb')) {
                textRunOptions.color = rgbToHex(mark.attrs.color);
              } else {
                let hex = colorNameToHex[mark.attrs.color];
                if (hex) {
                  textRunOptions.color = hex;
                } else {
                  console.warn(`[convertTextNode] Invalid color: ${
                    mark.attrs.color
                  }.
                    We couldn't process your color string to any of the available colors: ${new Intl.ListFormat(
                      'en',
                      { style: 'long', type: 'conjunction' }
                    ).format(Object.keys(colorNameToHex))}.
                    Supported formats are #000000 (6-digit hex), rgb(0, 0, 0), and the available color names.
                    This color will be ignored.`);
                }
              }
            }
            if (mark.attrs.fontFamily) {
              textRunOptions.font = parseFontFamily(mark.attrs.fontFamily);
            }
            if (mark.attrs.fontSize) {
              textRunOptions.size = pixelsToHalfPoints(
                parseInt(mark.attrs.fontSize, 10)
              );
            }
          }
          break;
        case 'highlight':
          if (!mark.attrs?.color) {
            textRunOptions.highlight = 'yellow';
            break;
          }
          if (mark.attrs.color.startsWith('#')) {
            let fill = mark.attrs.color.slice(1).toUpperCase();
            textRunOptions.shading = { type: ShadingType.SOLID, fill: fill };
            break;
          }
          if (isHighlightColor(mark.attrs.color)) {
            textRunOptions.highlight = mark.attrs.color;
            break;
          }
          textRunOptions.highlight = 'yellow'; // Default fallback
          break;
        case 'link':
          isLink = true;
          textRunOptions.style = 'Hyperlink';
          linkAttrs.href = mark.attrs?.href;
          break;
        default:
          break;
      }
    });
  }

  let textRun = new TextRun({ text: node.text || '', ...textRunOptions });

  return isLink && linkAttrs.href
    ? new ExternalHyperlink({ link: linkAttrs.href, children: [textRun] })
    : textRun;
}

// --- Block Node Converters ---

/**
 * Converts a Tiptap paragraph node to one or more docx Paragraphs.
 * It handles splitting paragraphs if they contain images.
 */
export async function convertParagraph({
  node,
  customNodes,
  options,
  list,
}: {
  node: Node;
  customNodes: CustomNode[];
  options?: IParagraphOptions;
  list?: {
    type: 'bullet' | 'ordered';
    level: number;
    orderedListInstanceId?: number;
  };
}): Promise<Paragraph | Paragraph[]> {
  // If a style is passed (e.g., "Quote"), create a single paragraph
  if (options?.style) {
    let textRuns = (node.content || [])
      .map((childNode) =>
        childNode.type === 'inlineMath'
          ? convertInlineMath(childNode)
          : convertTextNode(childNode)
      )
      .filter((run) => run !== null) as (TextRun | Math)[];
    return new Paragraph({ children: textRuns, style: options.style });
  }

  // Handle standard paragraphs
  let textAlign = AlignmentType.LEFT;
  if (node.attrs && node.attrs.textAlign) {
    switch (node.attrs.textAlign) {
      case 'center':
        textAlign = AlignmentType.CENTER;
        break;
      case 'right':
        textAlign = AlignmentType.RIGHT;
        break;
      default:
        textAlign = AlignmentType.LEFT;
    }
  }

  let lineHeight = 1;
  let textStyleMarks =
    node.marks?.filter((mark) => mark.type === 'textStyle') ?? [];
  if (textStyleMarks.length > 0 && textStyleMarks[0].attrs?.lineHeight) {
    lineHeight = textStyleMarks[0].attrs.lineHeight;
  }

  // Accumulator to hold paragraphs and current text runs
  let accumulator = {
    paragraphs: [] as (Paragraph | Table)[],
    currentTextRuns: [] as (TextRun | Math | ExternalHyperlink)[],
  };

  let reduced = await (node.content || []).reduce(
    async (accPromise, childNode) => {
      let acc = await accPromise;

      // Check for custom nodes
      let customRenderer = customNodes.find(
        (renderer) => renderer.type === childNode.type
      );
      if (customRenderer) {
        let rendered = customRenderer.render(childNode);
        if (rendered === null) {
          return acc;
        }
        if (rendered instanceof TextRun) {
          acc.currentTextRuns.push(rendered);
          return acc;
        }
        // Handle other custom types if needed
      }

      if (childNode.type === 'inlineMath') {
        let mathComponent = convertInlineMath(childNode);
        if (mathComponent) {
          acc.currentTextRuns.push(mathComponent);
        }
        return acc;
      }

      if (childNode.type === 'image') {
        // Image found: push current text runs as a paragraph
        if (acc.currentTextRuns.length > 0) {
          acc.paragraphs.push(
            new Paragraph({
              children: [...acc.currentTextRuns],
              alignment: textAlign,
            })
          );
          acc.currentTextRuns = []; // Reset runs
        }
        // Add the image as its own paragraph
        let imageComponent = await convertImage({ node: childNode });
        acc.paragraphs.push(imageComponent);
        return acc;
      }

      // Default to text node
      let textRun = convertTextNode(childNode);
      if (textRun) {
        acc.currentTextRuns.push(textRun);
      }
      return acc;
    },
    Promise.resolve(accumulator)
  );

  // If no content, return an empty array
  if (reduced.currentTextRuns.length === 0 && reduced.paragraphs.length === 0) {
    return [];
  }

  // If only paragraphs (e.g., only images), return them
  if (reduced.currentTextRuns.length === 0) {
    return reduced.paragraphs.length === 1
      ? reduced.paragraphs[0]
      : reduced.paragraphs;
  }

  // Handle heading levels
  let headingLevel: HeadingLevel | undefined;
  if (node.attrs && node.attrs.level) {
    switch (node.attrs.level) {
      case 1:
        headingLevel = HeadingLevel.HEADING_1;
        break;
      case 2:
        headingLevel = HeadingLevel.HEADING_2;
        break;
      case 3:
        headingLevel = HeadingLevel.HEADING_3;
        break;
      case 4:
        headingLevel = HeadingLevel.HEADING_4;
        break;
      case 5:
        headingLevel = HeadingLevel.HEADING_5;
        break;
      case 6:
        headingLevel = HeadingLevel.HEADING_6;
        break;
      default:
        headingLevel = undefined;
    }
  }

  // Push any remaining text runs as the last paragraph
  reduced.paragraphs.push(
    new Paragraph({
      children: reduced.currentTextRuns,
      alignment: textAlign,
      spacing: { line: lineHeightToDocx(lineHeight) },
      ...(list?.type === 'bullet' && { bullet: { level: list.level ?? 0 } }),
      ...(list?.type === 'ordered' && {
        numbering: {
          reference: 'ordered-list',
          level: list.level ?? 0,
          instance: list.orderedListInstanceId,
        },
      }),
      ...(headingLevel && { heading: headingLevel }),
    })
  );

  return reduced.paragraphs.length === 1
    ? reduced.paragraphs[0]
    : reduced.paragraphs;
}

/**
 * Converts a Tiptap heading node.
 */
export async function convertHeading({
  node,
  customNodes,
}: {
  node: Node;
  customNodes: CustomNode[];
}): Promise<Paragraph | Paragraph[]> {
  return convertParagraph({ node: node, customNodes: customNodes });
}

// --- Horizontal Rule ---

const createHorizontalRuleElement = () =>
  new BuilderElement({
    name: 'v:rect',
    attributes: {
      style: {
        key: 'style',
        value:
          'width:0.0pt;height:.05pt;mso-width-percent:0;mso-height-percent:0;mso-width-percent:0;mso-height-percent:0',
      },
      hr: { key: 'o:hr', value: 't' },
      hrstd: { key: 'o:hrstd', value: 't' },
      hralign: { key: 'o:hralign', value: 'center' },
      fillcolor: { key: 'fillcolor', value: '#A0A0A0' },
      stroked: { key: 'stroked', value: 'f' },
    },
  });

const createPictureElement = (children: BuilderElement[]) =>
  new BuilderElement({ name: 'w:pict', children: children });

const createHorizontalRule = () =>
  new Paragraph({
    children: [
      new Run({
        children: [createPictureElement([createHorizontalRuleElement()])],
      }),
    ],
    style: 'horizontalRule', // Assumes a "horizontalRule" style is defined
  });

// --- List Handling ---

let usedListInstanceIds = new Set<number>();

/**
 * Generates a unique instance ID for an ordered list.
 */
function getUniqueListInstanceId(): number {
  let id: number;
  do {
    id = Math.floor(Math.random() * 1000000) + 1;
  } while (usedListInstanceIds.has(id));
  usedListInstanceIds.add(id);
  return id;
}

/**
 * Clears the set of used list IDs.
 */
function clearListInstanceIds(): void {
  usedListInstanceIds.clear();
}

/**
 * Converts a Tiptap orderedList node.
 */
export async function convertOrderedList({
  node,
  customNodes,
  level = 0,
}: {
  node: Node;
  customNodes: CustomNode[];
  level?: number;
}): Promise<Paragraph[]> {
  let listInstanceId = getUniqueListInstanceId();
  let listItems = node.content || [];
  let paragraphs = (
    await Promise.all(
      listItems.map((item) =>
        convertListItem({
          item: item,
          listType: 'ordered',
          level: level,
          orderedListInstanceId: listInstanceId,
          customNodes: customNodes,
        })
      )
    )
  )
    .flat()
    .filter((p) => p !== null) as Paragraph[];

  return paragraphs;
}

/**
 * Converts a Tiptap listItem node.
 */
export async function convertListItem({
  item,
  listType,
  level = 0,
  orderedListInstanceId,
  customNodes,
}: {
  item: Node;
  listType: 'bullet' | 'ordered';
  level?: number;
  orderedListInstanceId?: number;
  customNodes: CustomNode[];
}): Promise<Paragraph[]> {
  if (!item.content) {
    return [];
  }

  console.log('Convert list item:', item.type);
  let paragraphs: Paragraph[] = [];
  let childNodes = item.content;

  for (let i = 0, len = childNodes.length; i < len; i++) {
    let child = childNodes[i];

    if (child.type === 'paragraph') {
      console.log('Convert list item paragraph:', child.type);
      let paragraph = await convertParagraph({
        node: child,
        customNodes: customNodes,
        list: {
          type: listType,
          level: level,
          orderedListInstanceId: orderedListInstanceId,
        },
      });
      console.log('Converted list item paragraph:', child.type);
      Array.isArray(paragraph)
        ? paragraphs.push(...paragraph)
        : paragraphs.push(paragraph);
    } else if (child.type === 'bulletList') {
      paragraphs.push(
        ...(await convertBulletList({
          node: child,
          customNodes: customNodes,
          level: level + 1,
        }))
      );
    } else if (child.type === 'orderedList') {
      paragraphs.push(
        ...(await convertOrderedList({
          node: child,
          customNodes: customNodes,
          level: level + 1,
        }))
      );
    } else {
      // Handle other nested content as paragraphs
      let paragraph = await convertParagraph({
        node: child,
        customNodes: customNodes,
      });
      Array.isArray(paragraph)
        ? paragraphs.push(...paragraph)
        : paragraphs.push(paragraph);
    }
  }
  return paragraphs;
}

/**
 * Converts a Tiptap bulletList node.
 */
export async function convertBulletList({
  node,
  customNodes,
  level = 0,
}: {
  node: Node;
  customNodes: CustomNode[];
  level?: number;
}): Promise<Paragraph[]> {
  let listItems = node.content || [];
  let paragraphs = (
    await Promise.all(
      listItems.map((item) =>
        convertListItem({
          item: item,
          listType: 'bullet',
          level: level,
          customNodes: customNodes,
        })
      )
    )
  )
    .flat()
    .filter((p) => p !== null) as Paragraph[];

  return paragraphs;
}

/**
 * Converts a Tiptap blockquote node.
 */
export async function convertQuote({
  node,
  customNodes,
}: {
  node: Node;
  customNodes: CustomNode[];
}): Promise<Paragraph[]> {
  if (!node.content) {
    return [];
  }

  let paragraphs = (
    await Promise.all(
      node.content.map((child) =>
        convertParagraph({
          node: child,
          customNodes: customNodes,
          options: { style: 'Quote' },
        })
      )
    )
  ).flatMap((p) => (Array.isArray(p) ? p : [p]));

  return paragraphs;
}

// --- Table Handling ---

/**
 * Converts a Tiptap tableCell or tableHeader node to a docx TableCell.
 */
export async function convertTableCell({
  node,
  customNodes,
  columnWidthPercentage,
  columnWidthTwips,
  totalColumns,
}: {
  node: Node;
  customNodes: CustomNode[];
  columnWidthPercentage?: number;
  columnWidthTwips?: number;
  totalColumns?: number;
}): Promise<TableCell> {
  let paragraphPromises = (node.content || []).map(
    async (child) =>
      child.type === 'paragraph'
        ? convertParagraph({ node: child, customNodes: customNodes })
        : new Paragraph({ children: [] }) // Fallback for unexpected content
  );

  let paragraphs = (await Promise.all(paragraphPromises)).flatMap(
    (p) => (Array.isArray(p), p)
  );

  let colspan = node.attrs?.colspan ? Number(node.attrs.colspan) : 1;
  let useTwips = columnWidthTwips !== undefined;

  let width: number;
  if (useTwips) {
    width = columnWidthTwips * colspan;
  } else if (columnWidthPercentage) {
    width = columnWidthPercentage * colspan;
  } else {
    width = (100 / (totalColumns || 1)) * colspan;
  }

  let cellOptions: any = {
    children: paragraphs,
    width: {
      size: width,
      type: useTwips ? WidthType.DXA : WidthType.PERCENTAGE,
    },
  };

  if (node.attrs && node.attrs.colspan && Number(node.attrs.colspan) > 1) {
    cellOptions.columnSpan = Number(node.attrs.colspan);
  }

  return new TableCell(cellOptions);
}

/**
 * Calculates the maximum number of columns in any row of a table.
 */
function getMaxColumns(tableNode: Node): number {
  let columnCounts = (tableNode.content || []).map((row) =>
    (row.content || []).reduce((count, cell) => {
      let colspan = cell.attrs?.colspan ? Number(cell.attrs.colspan) : 1;
      return count + Math.max(1, colspan);
    }, 0)
  );
  return Math.max(...columnCounts, 0) || 1;
}

/**
 * Converts a Tiptap tableRow node to a docx TableRow.
 */
export async function convertTableRow({
  node,
  customNodes,
}: {
  node: Node;
  customNodes: CustomNode[];
}): Promise<TableRow> {
  let cells = (
    await Promise.all(
      (node.content || []).map((cellNode) =>
        convertTableCell({
          node: cellNode,
          customNodes: customNodes,
          columnWidthPercentage: undefined,
          columnWidthTwips: undefined,
          totalColumns: undefined,
        })
      )
    )
  ).filter((cell) => cell !== null) as TableCell[];

  return new TableRow({ children: cells });
}

/**
 * Converts a Tiptap table node to a docx Table.
 */
export async function convertTable({
  node,
  customNodes,
  pageSize,
  pageMargins,
}: {
  node: Node;
  customNodes: CustomNode[];
  pageSize: ConvertConfig['pageSize'];
  pageMargins: ConvertConfig['pageMargins'];
}): Promise<Table> {
  const totalColumns = getMaxColumns(node);

  // Calculate available page width in Twips
  const pageWidth = pageSize?.width || '21.0cm';
  const marginLeft = pageMargins?.left || '3.17cm';
  const marginRight = pageMargins?.right || '3.17cm';

  // Helper to convert universal measures to Twips
  const toTwips = (measure: string): number => {
    const unit = measure.match(/[a-z%]+$/i)?.[0] || 'cm';
    const value = parseFloat(measure.replace(/[a-z%]/gi, ''));

    switch (unit.toLowerCase()) {
      case 'cm':
        return Math.round(value * 567);
      case 'in':
        return Math.round(value * 1440);
      case 'pt':
        return Math.round(value * 20);
      case 'pc':
        return Math.round(value * 240);
      case 'mm':
        return Math.round(value * 56.7);
      case 'px':
        return Math.round(value * 15);
      default:
        return Math.round(value * 567); // Default to cm
    }
  };

  const availableWidth =
    toTwips(pageWidth) - toTwips(marginLeft) - toTwips(marginRight);
  const columnWidthPercentage = 100 / totalColumns;
  const columnWidthTwips = Math.floor(availableWidth / totalColumns);

  let rowPromises = (node.content || []).map(async (rowNode) => {
    let cellPromises = (rowNode.content || []).map(async (cellNode) =>
      convertTableCell({
        node: cellNode,
        customNodes: customNodes,
        columnWidthPercentage: columnWidthPercentage,
        columnWidthTwips: columnWidthTwips,
        totalColumns: totalColumns,
      })
    );
    let cells = await Promise.all(cellPromises);
    return new TableRow({ children: cells });
  });

  let rows = await Promise.all(rowPromises);

  return new Table({
    rows: rows,
    width: {
      size: availableWidth,
      type: WidthType.DXA,
    },
    layout: TableLayoutType.FIXED,
    columnWidths: Array(totalColumns).fill(columnWidthTwips),
    margins: {
      top: convertInchesToTwip(0.01),
      bottom: convertInchesToTwip(0.01),
      left: convertInchesToTwip(0.01),
      right: convertInchesToTwip(0.01),
    },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: 'auto' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: 'auto' },
      left: { style: BorderStyle.SINGLE, size: 4, color: 'auto' },
      right: { style: BorderStyle.SINGLE, size: 4, color: 'auto' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'auto' },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: 'auto' },
    },
  });
}

// --- Main Conversion Logic ---

/**
 * Converts a generic Tiptap node to its docx equivalent.
 */
export async function convertNode({
  node,
  customNodes = [],
  pageSize,
  pageMargins,
}: ConvertConfig): Promise<(Paragraph | Table) | (Paragraph | Table)[] | null> {
  console.log('Convert node type:', node.type);

  switch (node.type) {
    case 'paragraph':
      return convertParagraph({ node: node, customNodes: customNodes });
    case 'bulletList':
      return convertBulletList({ node: node, customNodes: customNodes });
    case 'orderedList':
      return convertOrderedList({ node: node, customNodes: customNodes });
    case 'listItem':
      // This case should ideally be handled by list converters, but added as fallback
      return convertListItem({
        item: node,
        listType: 'bullet',
        customNodes: customNodes,
      });
    case 'table':
      return convertTable({
        node: node,
        customNodes: customNodes,
        pageSize: pageSize,
        pageMargins: pageMargins,
      });
    case 'image':
      return [await convertImage({ node: node })];
    case 'heading':
      return convertHeading({ node: node, customNodes: customNodes });
    case 'blockquote':
      return convertQuote({ node: node, customNodes: customNodes });
    case 'horizontalRule':
      return createHorizontalRule();
    case 'blockMath':
      return convertBlockMath({ node: node });
    default: {
      if (customNodes) {
        let customRenderer = customNodes.find(
          (renderer) => renderer.type === node.type
        );
        if (customRenderer) {
          return customRenderer.render(node);
        }
        console.error(`Custom node "${node.type}" not found`);
        return [];
      }
      return [];
    }
  }
}

/**
 * A simple deep merge function for objects.
 */
function deepMerge(target: any, source: any): any {
  if (typeof target !== 'object' || target === null) {
    return source;
  }
  if (typeof source !== 'object' || source === null) {
    return target;
  }

  Object.keys(source).forEach((key) => {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (Array.isArray(sourceValue) && Array.isArray(targetValue)) {
      // Special handling for arrays (e.g., paragraphStyles)
      let newArray = [...targetValue];
      sourceValue.forEach((item) => {
        if (item && typeof item === 'object' && item.id) {
          // If item has an ID, try to find and replace
          let index = newArray.findIndex(
            (targetItem) => targetItem.id === item.id
          );
          if (index !== -1) {
            newArray[index] = deepMerge(newArray[index], item);
          } else {
            newArray.push(item);
          }
        } else {
          // Otherwise, just push
          newArray.push(item);
        }
      });
      target[key] = newArray;
    } else if (typeof sourceValue === 'object' && sourceValue !== null) {
      target[key] = deepMerge(
        typeof targetValue === 'object' && targetValue !== null
          ? targetValue
          : {},
        sourceValue
      );
    } else {
      target[key] = sourceValue;
    }
  });

  return target;
}

/**
 * Converts the full Tiptap JSON document to a docx.Document object.
 */
async function convertJsonToDocx({
  node,
  customNodes = [],
  styleOverrides,
  pageSize,
  pageMargins,
  headers,
  footers,
}: ConvertConfig): Promise<Document> {
  let styles = deepMerge(defaultStyles, styleOverrides);

  let nodePromises = (node.content || []).map((childNode) =>
    convertNode({
      node: childNode,
      customNodes: customNodes,
      styleOverrides: styles,
      pageSize: pageSize,
      pageMargins: pageMargins,
    })
  );

  let children = (await Promise.all(nodePromises))
    .flatMap((item) =>
      Array.isArray(item)
        ? item
        : item instanceof Paragraph || item instanceof Table
        ? [item]
        : []
    )
    .filter((item) => item !== null) as (Paragraph | Table)[];

  // Resolve header/footer functions
  let docxHeaders = {
    default:
      headers?.default instanceof Function
        ? await headers.default()
        : headers?.default,
    first:
      headers?.first instanceof Function
        ? await headers.first()
        : headers?.first,
    even:
      headers?.even instanceof Function ? await headers.even() : headers?.even,
  };

  let docxFooters = {
    default:
      footers?.default instanceof Function
        ? await footers.default()
        : footers?.default,
    first:
      footers?.first instanceof Function
        ? await footers.first()
        : footers?.first,
    even:
      footers?.even instanceof Function ? await footers.even() : footers?.even,
  };

  // Clear list instance IDs for the next export
  clearListInstanceIds();

  return new Document({
    numbering: {
      config: [
        {
          reference: 'ordered-list',
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: 'left',
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
            {
              level: 1,
              format: LevelFormat.DECIMAL,
              text: '%2.',
              alignment: 'left',
              style: { paragraph: { indent: { left: 1140, hanging: 360 } } },
            },
            {
              level: 2,
              format: LevelFormat.DECIMAL,
              text: '%3.',
              alignment: 'left',
              style: { paragraph: { indent: { left: 1440, hanging: 360 } } },
            },
            {
              level: 3,
              format: LevelFormat.DECIMAL,
              text: '%4.',
              alignment: 'left',
              style: { paragraph: { indent: { left: 1740, hanging: 360 } } },
            },
            {
              level: 4,
              format: LevelFormat.DECIMAL,
              text: '%5.',
              alignment: 'left',
              style: { paragraph: { indent: { left: 2040, hanging: 360 } } },
            },
            {
              level: 5,
              format: LevelFormat.DECIMAL,
              text: '%6.',
              alignment: 'left',
              style: { paragraph: { indent: { left: 2340, hanging: 360 } } },
            },
            {
              level: 6,
              format: LevelFormat.DECIMAL,
              text: '%7.',
              alignment: 'left',
              style: { paragraph: { indent: { left: 2640, hanging: 360 } } },
            },
            {
              level: 7,
              format: LevelFormat.DECIMAL,
              text: '%8.',
              alignment: 'left',
              style: { paragraph: { indent: { left: 2940, hanging: 360 } } },
            },
            {
              level: 8,
              format: LevelFormat.DECIMAL,
              text: '%9.',
              alignment: 'left',
              style: { paragraph: { indent: { left: 3240, hanging: 360 } } },
            },
          ],
        },
      ],
    },
    evenAndOddHeaderAndFooters:
      !!headers?.evenAndOddHeaders || !!footers?.evenAndOddFooters,
    sections: [
      {
        properties: {
          page: {
            size: {
              width: pageSize?.width || '21.0cm',
              height: pageSize?.height || '29.7cm',
            },
            margin: {
              top: pageMargins?.top || '2.54cm',
              bottom: pageMargins?.bottom || '2.54cm',
              left: pageMargins?.left || '3.17cm',
              right: pageMargins?.right || '3.17cm',
            },
          },
          titlePage: !!headers?.first || !!footers?.first,
        },
        headers: docxHeaders,
        footers: docxFooters,
        children: children,
      },
    ],
    styles: styles,
  });
}

/**
 * Main export function. Converts JSON to a docx.Document and then packs it.
 */
export const exportDocx = async ({
  document,
  exportType,
  customNodes,
  styleOverrides,
  pageSize,
  pageMargins,
  headers = undefined,
  footers = undefined,
  extensions = [],
}: ExportDocxOptions): Promise<any> => {
  // Check for header/footer server-side extension
  for (let ext of extensions) {
    if (ext.id === 'export-docx-header-footer-server-side') {
      let extOptions = (ext as any)[EXPORT_DOCX_HEADER_FOOTER_KEY];
      let hasHeaders = !!headers;
      let hasFooters = !!footers;

      if (
        !extOptions[EXPORT_DOCX_HEADER_FOOTER_KEY].allowedHeadersAndFooters &&
        (hasHeaders || hasFooters)
      ) {
        headers = undefined;
        footers = undefined;
        console.warn(
          'The [exportDocx] server side function requires the [ExportDocxHeaderFooterServerSideExtension] extension to be passed to the `convertExtensions` array to use headers and footers'
        );
      }
    }
  }

  let doc = await convertJsonToDocx({
    node: document,
    styleOverrides: styleOverrides,
    customNodes: customNodes,
    headers: headers,
    footers: footers,
    pageSize: pageSize,
    pageMargins: pageMargins,
  });

  if (!doc) {
    throw new Error('Failed to convert document');
  }

  let output: any;
  try {
    switch (exportType) {
      case 'buffer':
        output = await Packer.toBuffer(doc);
        break;
      case 'string':
        output = await Packer.toString(doc);
        break;
      case 'base64':
        output = await Packer.toBase64String(doc);
        break;
      case 'blob':
        output = await Packer.toBlob(doc);
        break;
      case 'stream':
        output = Packer.toStream(doc);
        break;
      default:
        throw new Error('Invalid export type');
    }
  } catch (error: any) {
    throw new Error(`Failed to export document: ${error.message}`);
  }

  return output;
};

// --- Tiptap Extensions ---

/**
 * Internal extension to signal that headers/footers are allowed.
 */
const ExportDocxHeaderFooter = Extension.create({
  name: 'export-docx-header-footer',
  addOptions() {
    return {
      [EXPORT_DOCX_HEADER_FOOTER_KEY]: {
        allowedHeadersAndFooters: true,
      },
    };
  },
});

/**
 * Extension object to pass to the server-side export function.
 */
const ExportDocxHeaderFooterExtension: ConvertExtensions = {
  id: 'export-docx-header-footer',
  [EXPORT_DOCX_HEADER_FOOTER_KEY]: {
    allowedHeadersAndFooters: true,
  },
};

/**
 * The main Tiptap extension for exporting to DOCX.
 */
export const ExportDocx = Extension.create<TiptapExportDocxOptions>({
  name: 'export-docx',
  addOptions() {
    return {
      styleOverrides: {},
      customNodes: [],
      exportType: 'blob',
      headers: undefined,
      footers: undefined,
      pageSize: undefined,
      pageMargins: undefined,
      onCompleteExport: () => {
        throw new Error(
          'The [exportDocx] extension requires an [onCompleteExport] callback function to handle the exported DOCX file'
        );
      },
    };
  },
  addCommands() {
    return {
      exportDocx:
        (options?: Partial<TiptapExportDocxOptions>) =>
        async ({ editor }) => {
          let config: ExportDocxOptions = {
            document: editor.getJSON(),
            styleOverrides:
              options?.styleOverrides ?? this.options.styleOverrides,
            customNodes: options?.customNodes ?? this.options.customNodes,
            exportType: options?.exportType ?? this.options.exportType,
            pageSize: options?.pageSize ?? this.options.pageSize,
            pageMargins: options?.pageMargins ?? this.options.pageMargins,
            extensions: [],
          };

          // Check if the header/footer extension is installed
          let hasHeaderFooterExt = !!editor.extensionManager.extensions.find(
            (ext) => {
              return (
                !!ext.options[EXPORT_DOCX_HEADER_FOOTER_KEY] &&
                ext.options[EXPORT_DOCX_HEADER_FOOTER_KEY]
                  .allowedHeadersAndFooters === true
              );
            }
          );

          let hasHeaders = !!(options?.headers || this.options.headers);
          let hasFooters = !!(options?.footers || this.options.footers);

          if (!hasHeaderFooterExt && (hasHeaders || hasFooters)) {
            console.warn(
              'The [ExportDocx] extension requires the [ExportDocxHeaderFooter] extension to be installed and configured to use headers and footers'
            );
          }

          if (hasHeaderFooterExt) {
            config.headers = options?.headers ?? this.options.headers;
            config.footers = options?.footers ?? this.options.footers;
            config.extensions?.push(ExportDocxHeaderFooterExtension);
          }

          let result = await exportDocx(config);

          if (options?.onCompleteExport) {
            options.onCompleteExport(result);
          } else {
            this.options.onCompleteExport(result);
          }

          return true;
        },
    };
  },
});

// --- Standalone Header/Footer/Row Converters ---

/**
 * Converts a Tiptap node (usually a paragraph) to a docx Footer.
 */
export async function convertFooter({ node }: { node: Node }): Promise<Footer> {
  let paragraphs = await convertParagraph({ node: node, customNodes: [] });
  return Array.isArray(paragraphs)
    ? new Footer({ children: paragraphs })
    : new Footer({ children: [paragraphs] });
}

/**
 * Converts a Tiptap node (usually a paragraph) to a docx Header.
 */
export async function convertHeader({ node }: { node: Node }): Promise<Header> {
  let paragraphs = await convertParagraph({ node: node, customNodes: [] });
  return Array.isArray(paragraphs)
    ? new Header({ children: paragraphs })
    : new Header({ children: [paragraphs] });
}

/**
 * Converts a Tiptap tableRow node to a docx TableRow.
 * (This is a standalone export, similar to the internal `convertTableRow`).
 */
export async function convertTableRowStandalone({
  node,
  customNodes,
}: {
  node: Node;
  customNodes: CustomNode[];
}): Promise<TableRow> {
  let cells = (
    await Promise.all(
      (node.content || []).map((cellNode) =>
        convertTableCell({
          node: cellNode,
          customNodes: customNodes,
          columnWidthPercentage: undefined,
          columnWidthTwips: undefined,
          totalColumns: undefined,
        })
      )
    )
  ).filter((cell) => cell !== null) as TableCell[];

  return new TableRow({ children: cells });
}
