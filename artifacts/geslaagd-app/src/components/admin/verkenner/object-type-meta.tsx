import {
  BookOpen,
  Compass,
  FileText,
  Layers,
  Link2,
  ListChecks,
  type LucideIcon,
} from 'lucide-react';

export type VerkennerObjectType = 'subject' | 'chapter' | 'content' | 'source' | 'crawl' | 'task';

type ObjectTypeMeta = {
  icon: LucideIcon;
  label: string;
  accent: string;
};

export const OBJECT_TYPE_META: Record<VerkennerObjectType, ObjectTypeMeta> = {
  subject: { icon: BookOpen, label: 'Vak', accent: 'verkenner-accent-subject' },
  chapter: { icon: Layers, label: 'Hoofdstuk', accent: 'verkenner-accent-chapter' },
  content: { icon: FileText, label: 'Inhoud', accent: 'verkenner-accent-content' },
  source: { icon: Link2, label: 'Bron', accent: 'verkenner-accent-source' },
  crawl: { icon: Compass, label: 'Crawl', accent: 'verkenner-accent-crawl' },
  task: { icon: ListChecks, label: 'Taak', accent: 'verkenner-accent-task' },
};

export const CONTENT_TYPE_LABEL: Record<string, string> = {
  summary: 'Samenvatting',
  key_notes: 'Kernpunten',
  exercise_bank: 'Opdrachten',
  exam: 'Toets',
  exam_rubric: 'Beoordelingsmodel',
  diagnostic_questionnaire: 'Diagnostische vragenlijst',
};
