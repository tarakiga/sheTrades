export type LessonStatus = "Draft" | "Published";

export type QuizQuestion = {
  question: string;
  options: string[];
  answerIndex: number;
};

export type LessonRecord = {
  id: string;
  moduleId: number;
  title: string;
  languages: {
    en: string;
    pcm?: string;
    ig?: string;
  };
  audioUrls: {
    en?: string;
    pcm?: string;
    ig?: string;
  };
  quiz: QuizQuestion[];
  status: LessonStatus;
  createdAt: string;
  updatedAt: string;
};

export type ContentAdminRow = {
  module: string;
  lesson: string;
  language: string;
  quiz: string;
  status: LessonStatus;
};
