import { Suspense, lazy } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

import { FileMeta, PreviewMode } from '@/types/hyperview';

import { BinaryRenderer } from './renderers/BinaryRenderer';
import { MediaRenderer } from './renderers/MediaRenderer';

const ImageRenderer = lazy(() =>
  import('./renderers/ImageRenderer').then((module) => ({ default: module.ImageRenderer }))
);
const MarkupRenderer = lazy(() =>
  import('./renderers/MarkupRenderer').then((module) => ({ default: module.MarkupRenderer }))
);
const StructuredTextRenderer = lazy(() =>
  import('./renderers/StructuredTextRenderer').then((module) => ({ default: module.StructuredTextRenderer }))
);
const CodeRenderer = lazy(() =>
  import('./renderers/CodeRenderer').then((module) => ({ default: module.CodeRenderer }))
);
const PdfRenderer = lazy(() =>
  import('./renderers/PdfRenderer').then((module) => ({ default: module.PdfRenderer }))
);

function PreviewFallback() {
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  );
}

export function PreviewContent({
  meta,
  mode = meta.defaultMode,
}: {
  meta: FileMeta;
  mode?: PreviewMode;
}) {
  const reduceMotion = useReducedMotion();
  const transition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const };

  let content: React.ReactNode;

  switch (meta.previewType) {
    case 'image':
      content = (
        <Suspense fallback={<PreviewFallback />}>
          <ImageRenderer key={meta.path} meta={meta} />
        </Suspense>
      );
      break;
    case 'video':
    case 'audio':
      content = <MediaRenderer key={meta.path} meta={meta} />;
      break;
    case 'markdown':
    case 'html':
      content = (
        <Suspense fallback={<PreviewFallback />}>
          <MarkupRenderer key={`${meta.path}:${mode}`} meta={meta} mode={mode} />
        </Suspense>
      );
      break;
    case 'code':
      if (meta.supportedModes.length > 1) {
        content = (
          <Suspense fallback={<PreviewFallback />}>
            <StructuredTextRenderer key={`${meta.path}:${mode}`} meta={meta} mode={mode} />
          </Suspense>
        );
        break;
      }

      content = (
        <Suspense fallback={<PreviewFallback />}>
          <CodeRenderer key={meta.path} meta={meta} />
        </Suspense>
      );
      break;
    case 'pdf':
      content = (
        <Suspense fallback={<PreviewFallback />}>
          <PdfRenderer key={meta.path} meta={meta} />
        </Suspense>
      );
      break;
    default:
      content = <BinaryRenderer meta={meta} />;
      break;
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={`${meta.path}:${mode}`}
        className="h-full"
        initial={
          reduceMotion
            ? false
            : {
                opacity: 0,
                y: 10,
                scale: 0.995,
                filter: 'blur(10px)',
              }
        }
        animate={
          reduceMotion
            ? { opacity: 1 }
            : {
                opacity: 1,
                y: 0,
                scale: 1,
                filter: 'blur(0px)',
              }
        }
        exit={
          reduceMotion
            ? { opacity: 0 }
            : {
                opacity: 0,
                y: -8,
                scale: 0.995,
                filter: 'blur(8px)',
              }
        }
        transition={transition}
      >
        {content}
      </motion.div>
    </AnimatePresence>
  );
}
