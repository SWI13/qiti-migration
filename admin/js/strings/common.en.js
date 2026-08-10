/* ==========================================================================
   Qiti admin — نصوص مشتركة (إنجليزية)
   كل مفتاح هنا مستعمل في أكثر من صفحة، ولا في primitive تاع ui/.
   ⚠️ إذا المفتاح يخصّ صفحة وحدة برك — بلاصتو في الملف تاعها ماشي هنا.
   القسمة هذي موجودة باش ثلاث ناس يخدمو على ثلاث صفحات بلا ما يتصادمو
   في نفس الملف.
   ========================================================================== */

export var COMMON_EN = {
  /* ── أفعال عامة ── */
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.confirm': 'Confirm',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'common.view': 'View',
  'common.back': 'Back',
  'common.add': '+ Add',
  'common.more': 'More actions',
  'common.moveUp': 'Move up',
  'common.moveDown': 'Move down',
  'common.choose': 'Choose',
  'common.none': '— None —',
  'common.error': 'Something went wrong.',

  /* ── تحقّق الفورم (js/ui/form.js) ──
     الرسالة تقول واش يدير المستخدم، ماشي واش غلط فيه. "Required" وحدها
     تخلّيه يعاود يقرا الحقل باش يفهم واش راهي تطلب. */
  'validation.required': 'This field is required.',
  'validation.min': 'Enter {min} or more.',
  'validation.max': 'Enter {max} or less.',
  'validation.maxLength': 'Keep it to {max} characters or fewer.',
  'validation.pattern': 'This does not look right.',
  'validation.slug': 'Use lowercase letters, numbers and dashes only.',
  'validation.positiveNumber': 'Enter a number greater than zero.',
  'validation.summary': '{n} field(s) need attention.',

  /* ── تغييرات ما تحفظوش (js/ui/form.js) ── */
  'unsaved.title': 'Leave without saving?',
  'unsaved.body': 'Your changes on this page will be lost.',
  'unsaved.discard': 'Discard changes',

  /* ── جداول (js/ui/table.js) ── */
  'table.sortAsc': 'Sort ascending',
  'table.sortDesc': 'Sort descending',

  /* ── توست (js/ui/toast.js) ── */
  'toast.dismiss': 'Dismiss',
};
