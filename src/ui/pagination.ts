import { EmbedBuilder } from 'discord.js';

export function paginate<T>(items: T[], page: number, pageSize: number): {
  items: T[];
  page: number;
  totalPages: number;
} {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.max(1, Math.min(page, totalPages));
  const start = (safePage - 1) * pageSize;
  const end = start + pageSize;

  return {
    items: items.slice(start, end),
    page: safePage,
    totalPages,
  };
}

export function parseFooterPage(footerText: string | null | undefined): {
  page: number;
  totalPages: number;
} {
  if (!footerText) {
    return { page: 1, totalPages: 1 };
  }

  const match = footerText.match(/Page\s+(\d+)\/(\d+)/i);
  if (!match) {
    return { page: 1, totalPages: 1 };
  }

  const page = Number(match[1]);
  const totalPages = Number(match[2]);

  if (!Number.isFinite(page) || !Number.isFinite(totalPages)) {
    return { page: 1, totalPages: 1 };
  }

  return {
    page: Math.max(1, page),
    totalPages: Math.max(1, totalPages),
  };
}

export function setPageFooter(embed: EmbedBuilder, page: number, totalPages: number): EmbedBuilder {
  const existingFooter = embed.data.footer?.text;
  const prefix = existingFooter ? `${existingFooter} • ` : '';
  return embed.setFooter({ text: `${prefix}Page ${page}/${totalPages}` });
}
