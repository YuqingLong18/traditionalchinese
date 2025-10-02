import * as OpenCC from 'opencc-js';

const converter = OpenCC.Converter({ from: 'tw', to: 'cn' });

export const toSimplifiedChinese = (input: string): string => {
  if (!input) {
    return '';
  }

  try {
    return converter(input);
  } catch (error) {
    console.error('OpenCC conversion failed, returning original text.', error);
    return input;
  }
};

export const countCharacters = (content: string): number => content.replace(/\s+/g, '').length;

export const splitSentences = (content: string): string[] => {
  if (!content) {
    return [];
  }

  return content
    .split(/[\u3002\uff0c\uff1b\u3001,;\n]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
};
