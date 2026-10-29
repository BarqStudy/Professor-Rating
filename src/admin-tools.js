// Students never download plan import/editing, review moderation or R2 management.
import {createFileManager} from './files.js';
import {createStudyImport} from './study-import.js';
import {createStudyEditor} from './study-editor.js';
import {createPublishedReviews} from './published-reviews.js';
export function createAdminTools({api,uploadPlatformFile,extractStudyPlan,publishStudyPlan,updateStudyPlan,catalogue,ownerKey,onPlansChanged,onReviewRemoved}) {
  return {
    fileManager:createFileManager({api,upload:uploadPlatformFile,ownerKey}),
    studyImport:createStudyImport({catalogue,ownerKey,extract:extractStudyPlan,publish:publishStudyPlan,onPublished:()=>onPlansChanged('حُفظت الخطة وأصبحت متاحة للطلاب.')}),
    studyEditor:createStudyEditor({api,update:updateStudyPlan,ownerKey,onSaved:()=>onPlansChanged('حُفظت تعديلات الخطة.'),onDeleted:()=>onPlansChanged('حُذفت خطة التخصص.')}),
    publishedReviews:createPublishedReviews({api,catalogue,ownerKey,onRemoved:onReviewRemoved}),
  };
}
