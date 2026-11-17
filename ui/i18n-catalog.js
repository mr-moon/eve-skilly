"use strict";
const I18N_MESSAGES = {
  "acceleration_001": {
    "ru": "Расчёт инжекторов…",
    "en": "Calculating injectors…"
  },
  "acceleration_002": {
    "ru": "После {0} {1}: осталось {2} SP; общие SP — {3}; первая банка даст {4} SP. Количество на весь остаток плана; строки не суммируются.",
    "en": "After {0} {1}: {2} SP remaining; total SP: {3}; the first injector gives {4} SP. Covers the entire remaining plan; do not add the row values together."
  },
  "acceleration_003": {
    "ru": "{0} · после уровня",
    "en": "{0} · after level"
  },
  "acceleration_004": {
    "ru": "SP заданы вручную",
    "en": "SP set manually"
  },
  "acceleration_005": {
    "ru": "Общие SP персонажа из ESI",
    "en": "Character total SP from ESI"
  },
  "acceleration_006": {
    "ru": "Общий план: старт с 0 SP",
    "en": "Shared plan: starting at 0 SP"
  },
  "acceleration_007": {
    "ru": "Недоступно",
    "en": "Unavailable"
  },
  "acceleration_008": {
    "ru": "Считаем…",
    "en": "Calculating…"
  },
  "acceleration_009": {
    "ru": "Очередь обновляется…",
    "en": "Updating queue…"
  },
  "acceleration_010": {
    "ru": "Добавьте навыки",
    "en": "Add skills"
  },
  "acceleration_011": {
    "ru": "{0} шт. · {1}",
    "en": "{0} × {1}"
  },
  "acceleration_012": {
    "ru": "Нажмите для повторной попытки",
    "en": "Click to retry"
  },
  "acceleration_013": {
    "ru": "{0} · экономия {1}{2}{3}",
    "en": "{0} · saves {1}{2}{3}"
  },
  "acceleration_014": {
    "ru": " · нет нужного навыка",
    "en": " · required skill missing"
  },
  "acceleration_015": {
    "ru": " · ограничен срок применения",
    "en": " · use-by date applies"
  },
  "acceleration_016": {
    "ru": "Сейчас: {0} банок на {1} SP. Учтено свободных SP: {2}. Банки дадут {3} SP; остаток — {4} SP.",
    "en": "Injectors now: {0} for {1} SP. Unallocated SP used: {2}. Injectors provide {3} SP; {4} SP left."
  },
  "acceleration_017": {
    "ru": "Задано вручную",
    "en": "Set manually"
  },
  "acceleration_018": {
    "ru": "Из навыков {0}",
    "en": "From {0}'s skills"
  },
  "acceleration_019": {
    "ru": "персонажа",
    "en": "character"
  },
  "acceleration_020": {
    "ru": "Общий план: 0",
    "en": "Shared plan: 0"
  },
  "acceleration_021": {
    "ru": "Вернуть Biology персонажа · {0}",
    "en": "Use character Biology · {0}"
  },
  "acceleration_022": {
    "ru": "Вернуть Biology 0",
    "en": "Reset Biology to 0"
  },
  "acceleration_023": {
    "ru": "Ивентовый accelerator",
    "en": "Event accelerator"
  },
  "acceleration_024": {
    "ru": "Проверьте количество бустеров и общие SP.",
    "en": "Check the booster quantity and total SP."
  },
  "acceleration_025": {
    "ru": "Укажите корректные общие SP: целое число от 0 до 1 трлн.",
    "en": "Enter valid total SP: a whole number from 0 to 1 trillion."
  },
  "acceleration_026": {
    "ru": "Проверьте параметры своего бустера.",
    "en": "Check your custom booster settings."
  },
  "acceleration_027": {
    "ru": "Обновляем расчёт…",
    "en": "Updating calculation…"
  },
  "acceleration_028": {
    "ru": " Показан предыдущий расчёт.",
    "en": " Showing the previous calculation."
  },
  "acceleration_029": {
    "ru": "<tr data-accelerator-row=\"{0}\" class=\"{1}\"><td><button type=\"button\" data-accelerator-id=\"{2}\" aria-pressed=\"{3}\">{4}</button><small>+{5} · базово {6}д</small></td><td>{7}</td><td>−{8}</td><td>{9} / {10}{11}</td></tr>",
    "en": "<tr data-accelerator-row=\"{0}\" class=\"{1}\"><td><button type=\"button\" data-accelerator-id=\"{2}\" aria-pressed=\"{3}\">{4}</button><small>+{5} · base {6}d</small></td><td>{7}</td><td>−{8}</td><td>{9} / {10}{11}</td></tr>"
  },
  "acceleration_030": {
    "ru": "<h3>Сравнение бустеров · по {0} шт.</h3><div class=\"acceleration-table-scroll\"><table class=\"acceleration-table\"><thead><tr><th>Тип</th><th>Срок очереди</th><th>Экономия</th><th>Использовано</th></tr></thead><tbody>{1}</tbody></table></div><section class=\"acceleration-details\"><h3>Подробности выбранного сценария: SP, дозы и эффективность</h3><div class=\"booster-scenario\"><dl>\n    <div><dt>Срок с бустером</dt><dd>{2}</dd></div>\n    <div><dt>Экономия</dt><dd>{3} · {4}%</dd></div>\n    <div><dt>SP от ускорения обучения</dt><dd>{5} SP</dd></div>\n    <div><dt>Использовано доз</dt><dd>{6} из {7} · осталось {8}</dd></div>\n    </dl><p class=\"muted-note\">Без бустера: {9} · Biology при старте: {10}{11}</p>\n    {12}\n    {13}</div></section>\n    \n    <section class=\"settings-section\"><h3>Применение выбранного бустера</h3><div class=\"acceleration-table-scroll\"><table class=\"acceleration-table\"><thead><tr><th>Доза</th><th>Начало</th><th>Конец действия</th><th>Biology при применении</th></tr></thead><tbody>{14}</tbody></table></div></section>",
    "en": "<h3>Booster comparison · quantity {0}</h3><div class=\"acceleration-table-scroll\"><table class=\"acceleration-table\"><thead><tr><th>Type</th><th>Queue duration</th><th>Time saved</th><th>Used</th></tr></thead><tbody>{1}</tbody></table></div><section class=\"acceleration-details\"><h3>Selected scenario: SP, doses and efficiency</h3><div class=\"booster-scenario\"><dl>\n    <div><dt>Duration with booster</dt><dd>{2}</dd></div>\n    <div><dt>Time saved</dt><dd>{3} · {4}%</dd></div>\n    <div><dt>SP from faster training</dt><dd>{5} SP</dd></div>\n    <div><dt>Doses used</dt><dd>{6} of {7} · {8} left</dd></div>\n    </dl><p class=\"muted-note\">Without booster: {9} · Starting Biology: {10}{11}</p>\n    {12}\n    {13}</div></section>\n    \n    <section class=\"settings-section\"><h3>Selected booster usage</h3><div class=\"acceleration-table-scroll\"><table class=\"acceleration-table\"><thead><tr><th>Dose</th><th>Starts</th><th>Expires</th><th>Biology when applied</th></tr></thead><tbody>{14}</tbody></table></div></section>"
  },
  "acceleration_031": {
    "ru": " · бонус импланта +{0}%",
    "en": " · implant bonus +{0}%"
  },
  "acceleration_032": {
    "ru": "<p class=\"character-warning\">Для этого бустера нужен Science I. Он не изучен и не завершается в очереди.</p>",
    "en": "<p class=\"character-warning\">This booster requires Science I. It is neither trained nor completed in the queue.</p>"
  },
  "acceleration_033": {
    "ru": "<p class=\"character-warning\">Не все дозы можно применить до указанного срока.</p>",
    "en": "<p class=\"character-warning\">Some doses cannot be applied before the use-by date.</p>"
  },
  "acceleration_034": {
    "ru": "<tr><td colspan=\"4\">Дозы не применяются.</td></tr>",
    "en": "<tr><td colspan=\"4\">No doses are applied.</td></tr>"
  },
  "acceleration_035": {
    "ru": "Открываем сравнение бустеров…",
    "en": "Opening booster comparison…"
  },
  "acceleration_036": {
    "ru": "{0} · {1} · оптимизированная очередь",
    "en": "{0} · {1} · optimized queue"
  },
  "acceleration_037": {
    "ru": "персонаж",
    "en": "character"
  },
  "acceleration_038": {
    "ru": "общий план",
    "en": "shared plan"
  },
  "acceleration_039": {
    "ru": "Рассчитываем…",
    "en": "Calculating…"
  },
  "app_040": {
    "ru": "Новый план",
    "en": "New plan"
  },
  "app_041": {
    "ru": "{0}д {1}ч",
    "en": "{0}d {1}h"
  },
  "app_042": {
    "ru": "{0}д {1}ч {2}м",
    "en": "{0}d {1}h {2}m"
  },
  "app_043": {
    "ru": "{0}ч {1}м",
    "en": "{0}h {1}m"
  },
  "app_044": {
    "ru": "{0}м {1}с",
    "en": "{0}m {1}s"
  },
  "app_045": {
    "ru": "{0}м",
    "en": "{0}m"
  },
  "app_046": {
    "ru": "день {0}",
    "en": "day {0}"
  },
  "app_047": {
    "ru": "Укажите целые значения для всех пяти атрибутов.",
    "en": "Enter whole numbers for all five attributes."
  },
  "app_048": {
    "ru": "Каждый базовый атрибут должен быть от 17 до 27.",
    "en": "Each base attribute must be between 17 and 27."
  },
  "app_049": {
    "ru": "Осталось распределить: {0}. Сумма должна быть 99.",
    "en": "Points left to assign: {0}. The total must be 99."
  },
  "app_050": {
    "ru": "Уберите лишние очки: {0}. Сумма должна быть 99.",
    "en": "Remove {0} excess points. The total must be 99."
  },
  "app_051": {
    "ru": "{0} · базовые атрибуты из ESI, без имплантов и бустеров. Изменяются в игре.",
    "en": "{0} · base attributes from ESI, excluding implants and boosters. Change them in the game."
  },
  "app_052": {
    "ru": "Персонаж",
    "en": "Character"
  },
  "app_053": {
    "ru": "17–27 · сумма всегда 99 · остальные атрибуты балансируются автоматически",
    "en": "17–27 · total always 99 · other attributes balance automatically"
  },
  "app_054": {
    "ru": "Укажите целое число от 17 до 27",
    "en": "Enter a whole number from 17 to 27"
  },
  "app_055": {
    "ru": "<div class=\"attr-row\"><label for=\"attr-{0}\"><span class=\"attr-code\">{1}</span>{2}</label><input id=\"attr-{3}\" data-attr=\"{4}\" type=\"number\" min=\"17\" max=\"27\" step=\"1\" aria-describedby=\"attribute-note attribute-error\" value=\"{5}\" aria-label=\"{6} база\"></div>",
    "en": "<div class=\"attr-row\"><label for=\"attr-{0}\"><span class=\"attr-code\">{1}</span>{2}</label><input id=\"attr-{3}\" data-attr=\"{4}\" type=\"number\" min=\"17\" max=\"27\" step=\"1\" aria-describedby=\"attribute-note attribute-error\" value=\"{5}\" aria-label=\"{6} base\"></div>"
  },
  "app_056": {
    "ru": "<button class=\"goal-level {0}\" data-set-goal-level=\"{1}\" data-level=\"{2}\" aria-label=\"{3}: уровень {4}\" aria-pressed=\"{5}\" title=\"{6}{7}\" {8}></button>",
    "en": "<button class=\"goal-level {0}\" data-set-goal-level=\"{1}\" data-level=\"{2}\" aria-label=\"{3}: level {4}\" aria-pressed=\"{5}\" title=\"{6}{7}\" {8}></button>"
  },
  "app_057": {
    "ru": " · требуется не ниже {0}",
    "en": " · requires at least {0}"
  },
  "app_058": {
    "ru": "<div class=\"goal-row\" data-goal-id=\"{0}\"><div class=\"goal-info\"><strong title=\"{1}\">{2}</strong><small>{3}{4}</small></div><div class=\"goal-levels\" role=\"group\" aria-label=\"Целевой уровень {5}\">{6}</div><button class=\"icon-button goal-remove\" data-remove-goal=\"{7}\" aria-label=\"Удалить {8}\" {9}>×</button></div>",
    "en": "<div class=\"goal-row\" data-goal-id=\"{0}\"><div class=\"goal-info\"><strong title=\"{1}\">{2}</strong><small>{3}{4}</small></div><div class=\"goal-levels\" role=\"group\" aria-label=\"Target level {5}\">{6}</div><button class=\"icon-button goal-remove\" data-remove-goal=\"{7}\" aria-label=\"Remove {8}\" {9}>×</button></div>"
  },
  "app_059": {
    "ru": "Загрузка данных",
    "en": "Loading data"
  },
  "app_060": {
    "ru": " · минимум {0}{1}",
    "en": " · minimum {0}{1}"
  },
  "app_061": {
    "ru": " · требуется фитом",
    "en": " · required by fit"
  },
  "app_062": {
    "ru": "disabled title=\"Нужен для других навыков плана\"",
    "en": "disabled title=\"Required by other skills in the plan\""
  },
  "app_063": {
    "ru": "<div class=\"empty-goals\">Вставьте фит или добавьте первый навык справа.</div>",
    "en": "<div class=\"empty-goals\">Paste a fit or add your first skill on the right.</div>"
  },
  "app_064": {
    "ru": "Перед началом обучения",
    "en": "Before training starts"
  },
  "app_065": {
    "ru": "Через {0} · {1}",
    "en": "In {0} · {1}"
  },
  "app_066": {
    "ru": "<div class=\"event-items\">{0}</div><div class=\"event-prerequisite\">После Cybernetics {1}, перед следующим навыком.</div>",
    "en": "<div class=\"event-items\">{0}</div><div class=\"event-prerequisite\">After Cybernetics {1}, before the next skill.</div>"
  },
  "app_067": {
    "ru": "Сделать remap",
    "en": "Remap attributes"
  },
  "app_068": {
    "ru": "Купить и установить импланты",
    "en": "Buy and install implants"
  },
  "app_069": {
    "ru": "<tr class=\"skill-row\" tabindex=\"{0}\" data-row-index=\"{1}\" aria-selected=\"false\" data-skill-id=\"{2}\" data-skill-level=\"{3}\"><td class=\"row-number\">{4}</td><td class=\"skill-name-cell\"><i class=\"skill-marker {5}\"></i><span class=\"queue-skill-name\" title=\"{6} {7}\">{8} <span class=\"roman-level\">{9}</span></span><span class=\"queue-tracking-slot\">{10}</span></td><td class=\"time-column {11}\" title=\"{12}\">{13}</td><td class=\"rank-column\">{14}</td><td class=\"attribute-column\"><span class=\"attribute-chip attr-{15}\">{16}</span></td><td class=\"attribute-column\"><span class=\"attribute-chip attr-{17}\">{18}</span></td><td class=\"rate-column\">{19}</td><td class=\"level-column\"><span class=\"level-blocks\" data-target=\"{20}\" role=\"group\" aria-label=\"Этап обучения: уровень {21}\">{22}</span></td><td class=\"injector-column\" data-queue-index=\"{23}\">…</td></tr>",
    "en": "<tr class=\"skill-row\" tabindex=\"{0}\" data-row-index=\"{1}\" aria-selected=\"false\" data-skill-id=\"{2}\" data-skill-level=\"{3}\"><td class=\"row-number\">{4}</td><td class=\"skill-name-cell\"><i class=\"skill-marker {5}\"></i><span class=\"queue-skill-name\" title=\"{6} {7}\">{8} <span class=\"roman-level\">{9}</span></span><span class=\"queue-tracking-slot\">{10}</span></td><td class=\"time-column {11}\" title=\"{12}\">{13}</td><td class=\"rank-column\">{14}</td><td class=\"attribute-column\"><span class=\"attribute-chip attr-{15}\">{16}</span></td><td class=\"attribute-column\"><span class=\"attribute-chip attr-{17}\">{18}</span></td><td class=\"rate-column\">{19}</td><td class=\"level-column\"><span class=\"level-blocks\" data-target=\"{20}\" role=\"group\" aria-label=\"Training stage: level {21}\">{22}</span></td><td class=\"injector-column\" data-queue-index=\"{23}\">…</td></tr>"
  },
  "app_070": {
    "ru": "Обновляем расчёт инжекторов…",
    "en": "Updating injector calculation…"
  },
  "app_071": {
    "ru": "Учитываются текущие импланты и Cybernetics. {0}",
    "en": "Current implants and Cybernetics are included. {0}"
  },
  "app_072": {
    "ru": "Замена установленных имплантов разрешена.",
    "en": "Replacing installed implants is allowed."
  },
  "app_073": {
    "ru": "Занятые слоты защищены от замены.",
    "en": "Occupied slots are protected from replacement."
  },
  "app_074": {
    "ru": "+3 / +4 / +5 с учётом Cybernetics. Без ограничения по ISK, для учебного клона.",
    "en": "+3 / +4 / +5, accounting for Cybernetics. No ISK limit; assumes a training clone."
  },
  "app_075": {
    "ru": "Покупка учебных имплантов выключена.",
    "en": "Training implant purchases are disabled."
  },
  "app_076": {
    "ru": "Покупки проверяются при оптимизации очереди.",
    "en": "Purchases are evaluated during queue optimization."
  },
  "app_077": {
    "ru": "Добавьте цели, чтобы подобрать импланты.",
    "en": "Add goals to select implants."
  },
  "app_078": {
    "ru": "Цели уже выполнены — покупки не нужны.",
    "en": "Goals already completed — no purchases needed."
  },
  "app_079": {
    "ru": "В очереди: {0} {1}, {2} {3}.",
    "en": "In the queue: {0} {1}, {2} {3}."
  },
  "app_080": {
    "ru": "имплант",
    "en": "implant"
  },
  "app_081": {
    "ru": "импланта",
    "en": "implants"
  },
  "app_082": {
    "ru": "имплантов",
    "en": "implants"
  },
  "app_083": {
    "ru": "этап покупки",
    "en": "purchase stage"
  },
  "app_084": {
    "ru": "этапа покупки",
    "en": "purchase stages"
  },
  "app_085": {
    "ru": "этапов покупки",
    "en": "purchase stages"
  },
  "app_086": {
    "ru": "Новые импланты не сократили срок очереди с учётом обучения Cybernetics. Используются установленные.",
    "en": "New implants did not shorten the queue when Cybernetics training was included. Using current implants."
  },
  "app_087": {
    "ru": "Используются установленные импланты. Чтобы сравнить их с улучшенными, разрешите замену.",
    "en": "Using installed implants. Allow replacement to compare upgraded implants."
  },
  "app_088": {
    "ru": "Покупка имплантов с учётом обучения Cybernetics не сокращает эту очередь.",
    "en": "Buying implants does not shorten this queue when Cybernetics training is included."
  },
  "app_089": {
    "ru": "{0} распределений атрибутов. {1} Fitting CPU/PG и Alpha-ограничения не проверяются. Импланты из EFT добавляют требования навыков; рекомендации относятся к отдельному учебному клону.",
    "en": "{0} attribute allocations. {1} Fitting CPU/PG and Alpha restrictions are not checked. EFT implants add skill requirements; recommendations assume a separate training clone."
  },
  "app_090": {
    "ru": "уровень",
    "en": "level"
  },
  "app_091": {
    "ru": "уровня",
    "en": "levels"
  },
  "app_092": {
    "ru": "уровней",
    "en": "levels"
  },
  "app_093": {
    "ru": "навык",
    "en": "skill"
  },
  "app_094": {
    "ru": "навыка",
    "en": "skills"
  },
  "app_095": {
    "ru": "навыков",
    "en": "skills"
  },
  "app_096": {
    "ru": "Завершение {0}",
    "en": "Finishes {0}"
  },
  "app_097": {
    "ru": "Если начать обучение сейчас",
    "en": "If training starts now"
  },
  "app_098": {
    "ru": "{0}% меньше времени",
    "en": "{0}% less time"
  },
  "app_099": {
    "ru": "Подбор remap и имплантов",
    "en": "Selecting remaps and implants"
  },
  "app_100": {
    "ru": "В оптимизированном плане: {0} из {1} remap.",
    "en": "Remaps in optimized plan: {0} / {1}."
  },
  "app_101": {
    "ru": "Моменты выбираются автоматически.",
    "en": "Timing is selected automatically."
  },
  "app_102": {
    "ru": "Загружаем навык и зависимости…",
    "en": "Loading skill and prerequisites…"
  },
  "app_103": {
    "ru": "Навык добавлен в очередь",
    "en": "Skill added to the queue"
  },
  "app_104": {
    "ru": "Укажите целое число от 0 до 10",
    "en": "Enter a whole number from 0 to 10"
  },
  "app_105": {
    "ru": "Этот навык нужен для других целей плана",
    "en": "This skill is required by other plan goals"
  },
  "app_106": {
    "ru": "Очередь скопирована",
    "en": "Queue copied"
  },
  "app_107": {
    "ru": "Буфер обмена недоступен — скачайте .txt",
    "en": "Clipboard unavailable — download the .txt file"
  },
  "app_108": {
    "ru": "Открываем файл плана…",
    "en": "Opening plan file…"
  },
  "app_109": {
    "ru": "Открываем план…",
    "en": "Opening plan…"
  },
  "app_110": {
    "ru": "План больше 2 МБ",
    "en": "Plan exceeds 2 MB"
  },
  "app_111": {
    "ru": "Открываем локальный план…",
    "en": "Opening local plan…"
  },
  "auto_optimizer_112": {
    "ru": "Не удалось оптимизировать: {0}.{1}",
    "en": "Optimization failed: {0}.{1}"
  },
  "auto_optimizer_113": {
    "ru": " Повторяем автоматически…",
    "en": " Retrying automatically…"
  },
  "auto_optimizer_114": {
    "ru": " Следующая попытка — после изменения данных или повторного открытия плана.",
    "en": " The next attempt will run after you change the inputs or reopen the plan."
  },
  "auto_optimizer_115": {
    "ru": "Оптимизируем очередь…",
    "en": "Optimizing queue…"
  },
  "books_116": {
    "ru": "Цена неизвестна",
    "en": "Price unknown"
  },
  "books_117": {
    "ru": "книга",
    "en": "book"
  },
  "books_118": {
    "ru": "книги",
    "en": "books"
  },
  "books_119": {
    "ru": "книг",
    "en": "books"
  },
  "books_120": {
    "ru": " · нет цены для {0}",
    "en": " · no price for {0}"
  },
  "books_121": {
    "ru": "{0} книг · {1} · Jita 4-4, Fuzzwork sell.percentile{2}",
    "en": "Books: {0} · {1} · Jita 4-4, Fuzzwork sell.percentile{2}"
  },
  "books_122": {
    "ru": "Нужно купить: {0}. Уже введённых из оставшейся очереди исключено: {1}.",
    "en": "To buy: {0}. Already injected skills excluded from the remaining queue: {1}."
  },
  "books_123": {
    "ru": "ещё не загружены",
    "en": "not loaded yet"
  },
  "books_124": {
    "ru": "Самая старая проверка цен в этой оценке: {0}. Кэш — до 30 минут.",
    "en": "Oldest price check in this estimate: {0}. Cached for up to 30 minutes."
  },
  "books_125": {
    "ru": "Для {0} книг нет цены Jita. Итог содержит только известные цены.",
    "en": "Jita prices are missing for {0} books. The total includes known prices only."
  },
  "books_126": {
    "ru": "Нет цены Jita",
    "en": "No Jita price"
  },
  "books_127": {
    "ru": "Не загружено",
    "en": "Not loaded"
  },
  "books_128": {
    "ru": "<tr><td colspan=\"4\">Покупка книг не требуется.</td></tr>",
    "en": "<tr><td colspan=\"4\">No skillbooks need to be purchased.</td></tr>"
  },
  "books_129": {
    "ru": "Цена Jita недоступна",
    "en": "Jita price unavailable"
  },
  "books_130": {
    "ru": "Ожидаем оптимизированную очередь…",
    "en": "Waiting for the optimized queue…"
  },
  "books_131": {
    "ru": "Добавьте навыки в план",
    "en": "Add skills to the plan"
  },
  "books_132": {
    "ru": "Дождитесь автоматического обновления очереди",
    "en": "Wait for the queue to update automatically"
  },
  "books_133": {
    "ru": "Обновляем цены Jita 4-4…",
    "en": "Updating Jita 4-4 prices…"
  },
  "characters_134": {
    "ru": "Без плана",
    "en": "No plan"
  },
  "characters_135": {
    "ru": "Привязать план",
    "en": "Assign plan"
  },
  "characters_136": {
    "ru": "Сначала добавьте цели плана",
    "en": "Add plan goals first"
  },
  "characters_137": {
    "ru": "Привязать «{0}» к {1}",
    "en": "Assign “{0}” to {1}"
  },
  "characters_138": {
    "ru": "Отвязать план",
    "en": "Unassign plan"
  },
  "characters_139": {
    "ru": "Заменить отслеживаемый план «{0}» на «{1}» для {2}?",
    "en": "Replace the tracked plan “{0}” with “{1}” for {2}?"
  },
  "characters_140": {
    "ru": "Отключаем отслеживание…",
    "en": "Unassigning plan…"
  },
  "characters_141": {
    "ru": "Привязываем план…",
    "en": "Assigning plan…"
  },
  "characters_142": {
    "ru": "Отслеживание отключено",
    "en": "Plan unassigned"
  },
  "characters_143": {
    "ru": "План отслеживается для выбранного персонажа",
    "en": "Plan assigned to the selected character"
  },
  "characters_144": {
    "ru": "Без дополнительного: {0} · {1} remap. С ним: {2} · {3} remap.",
    "en": "Without extra: {0} · remaps: {1}. With extra: {2} · remaps: {3}."
  },
  "characters_145": {
    "ru": "Потратить ещё один remap · экономия {0}",
    "en": "Use one extra remap · saves {0}"
  },
  "characters_146": {
    "ru": "<p class=\"muted-note\">Нет подключённых персонажей</p>",
    "en": "<p class=\"muted-note\">No connected characters</p>"
  },
  "characters_147": {
    "ru": "Соберите очередь обучения",
    "en": "Build a training queue"
  },
  "characters_148": {
    "ru": "Оптимизация запускается автоматически при изменении навыков, персонажа или параметров.",
    "en": "Optimization runs automatically when skills, character or settings change."
  },
  "characters_149": {
    "ru": "Вставьте EFT-фит или добавьте навыки. Требования и предыдущие уровни появятся автоматически.",
    "en": "Paste an EFT fit or add skills. Prerequisites and preceding levels are added automatically."
  },
  "characters_150": {
    "ru": " Задано вручную.",
    "en": " Set manually."
  },
  "characters_151": {
    "ru": "Выбрать персонажа",
    "en": "Select character"
  },
  "characters_152": {
    "ru": "Общий план не зависит от персонажей",
    "en": "The shared plan is independent of characters"
  },
  "characters_153": {
    "ru": "Автоматическая оптимизация…",
    "en": "Automatic optimization…"
  },
  "characters_154": {
    "ru": "Отдельная адаптация · общий план не изменён",
    "en": "Separate adaptation · shared plan unchanged"
  },
  "characters_155": {
    "ru": "Данные ESI от {0}.",
    "en": "ESI data from {0}."
  },
  "characters_156": {
    "ru": "<strong>Установлены в активном клоне</strong>",
    "en": "<strong>Installed in the active clone</strong>"
  },
  "characters_157": {
    "ru": "В активном клоне нет имплантов",
    "en": "No implants in the active clone"
  },
  "characters_158": {
    "ru": "Изменились параметры адаптации, общий план или снимок персонажа. Адаптация обновится автоматически.",
    "en": "Adaptation settings, the shared plan or character snapshot changed. The adaptation will update automatically."
  },
  "characters_159": {
    "ru": "Годовой remap: {0}. Будущие восстановления remap в расчёт не включаются.",
    "en": "Annual remap: {0}. Future remap recoveries are not included in the calculation."
  },
  "characters_160": {
    "ru": "Готово",
    "en": "Done"
  },
  "characters_161": {
    "ru": "<div class=\"saved-plan-row\"><div class=\"saved-plan-info\"><strong>{0} · {1}</strong><small>{2} навыков · {3} remap · {4}</small></div><div class=\"saved-plan-actions\">{5}<button data-use-character=\"{6}\">Выбрать для плана</button><button data-sync-character=\"{7}\">Обновить ESI</button></div></div>",
    "en": "<div class=\"saved-plan-row\"><div class=\"saved-plan-info\"><strong>{0} · {1}</strong><small>{2} skills · {3} remap · {4}</small></div><div class=\"saved-plan-actions\">{5}<button data-use-character=\"{6}\">Use for plan</button><button data-sync-character=\"{7}\">Refresh ESI</button></div></div>"
  },
  "characters_162": {
    "ru": "<button data-open-tracked=\"{0}\">Открыть план</button>",
    "en": "<button data-open-tracked=\"{0}\">Open plan</button>"
  },
  "characters_163": {
    "ru": "<div class=\"library-empty\">Подключите персонажа, чтобы прочитать его навыки и импланты.</div>",
    "en": "<div class=\"library-empty\">Connect a character to read their skills and implants.</div>"
  },
  "characters_164": {
    "ru": "{0} подключён",
    "en": "{0} connected"
  },
  "characters_165": {
    "ru": "Открываем персонажей…",
    "en": "Opening characters…"
  },
  "characters_166": {
    "ru": "Открываем EVE SSO в браузере…",
    "en": "Opening EVE SSO in your browser…"
  },
  "characters_167": {
    "ru": "Завершите подключение в браузере",
    "en": "Complete sign-in in your browser"
  },
  "fits_168": {
    "ru": "<p class=\"muted-note\">Вставьте EFT во вкладке «Редактировать EFT».</p>",
    "en": "<p class=\"muted-note\">Paste EFT in the Edit EFT tab.</p>"
  },
  "fits_169": {
    "ru": "{0} позиций",
    "en": "{0} items"
  },
  "fits_170": {
    "ru": "{0} навыков",
    "en": "{0} skills"
  },
  "fits_171": {
    "ru": "Новый фит",
    "en": "New fit"
  },
  "fits_172": {
    "ru": "Привязан",
    "en": "Linked"
  },
  "fits_173": {
    "ru": "Заменить привязанный фит",
    "en": "Replace linked fit"
  },
  "fits_174": {
    "ru": "Сохранить фит и привязать",
    "en": "Save fit and link"
  },
  "fits_175": {
    "ru": "Защищены требования фита · версия {0}{1}",
    "en": "Fit requirements protected · version {0}{1}"
  },
  "fits_176": {
    "ru": " · есть новая версия",
    "en": " · new version available"
  },
  "fits_177": {
    "ru": "<button type=\"button\" class=\"saved-plan-row\" data-open-fit=\"{0}\"><span class=\"saved-plan-info\"><strong>{1} <span class=\"active-plan-badge\">ФИТ</span></strong><small>{2} · {3} · {4} {5} · {6}</small></span></button>",
    "en": "<button type=\"button\" class=\"saved-plan-row\" data-open-fit=\"{0}\"><span class=\"saved-plan-info\"><strong>{1} <span class=\"active-plan-badge\">FIT</span></strong><small>{2} · {3} · {4} {5} · {6}</small></span></button>"
  },
  "fits_178": {
    "ru": "план",
    "en": "plan"
  },
  "fits_179": {
    "ru": "плана",
    "en": "plans"
  },
  "fits_180": {
    "ru": "планов",
    "en": "plans"
  },
  "fits_181": {
    "ru": "Корзина фитов пуста.",
    "en": "Fit trash is empty."
  },
  "fits_182": {
    "ru": "Нет фитов. Вставьте EFT или найдите фит в Pyfa.",
    "en": "No fits yet. Paste EFT or find a fit in Pyfa."
  },
  "fits_183": {
    "ru": "Импортирован из Pyfa · проверка обновлений в меню действий",
    "en": "Imported from Pyfa · check for updates in the actions menu"
  },
  "fits_184": {
    "ru": "По фиту рассчитываются требования навыков.",
    "en": "Skill requirements are calculated from the fit."
  },
  "fits_185": {
    "ru": "Восстановить",
    "en": "Restore"
  },
  "fits_186": {
    "ru": "В корзину",
    "en": "Move to trash"
  },
  "fits_187": {
    "ru": "Фит сохранён. Привязанные планы сохраняют прежнюю версию до обновления.",
    "en": "Fit saved. Linked plans keep their previous version until updated."
  },
  "fits_188": {
    "ru": "Привязывайте фиты к исходным планам группы.",
    "en": "Link fits to the group's source plans."
  },
  "fits_189": {
    "ru": "Создать план из фита? Сохраните текущий план или оставьте его без изменений.",
    "en": "Create a plan from this fit? Save the current plan or leave it unchanged."
  },
  "fits_190": {
    "ru": "Заменить привязанный фит? Дополнительные цели останутся в плане.",
    "en": "Replace the linked fit? Additional plan goals will be kept."
  },
  "fits_191": {
    "ru": "Добавляем фит в план…",
    "en": "Adding fit to the plan…"
  },
  "fits_192": {
    "ru": "Проверяем фит и требования навыков…",
    "en": "Checking fit and skill requirements…"
  },
  "fits_193": {
    "ru": "Загружаем требования навыков из ESI…",
    "en": "Loading skill requirements from ESI…"
  },
  "fits_194": {
    "ru": "Создаём очередь навыков…",
    "en": "Creating skill queue…"
  },
  "fits_195": {
    "ru": "Новый пилот",
    "en": "New pilot"
  },
  "fits_196": {
    "ru": "Фит добавлен. Оптимизируем очередь…",
    "en": "Fit added. Optimizing queue…"
  },
  "fits_197": {
    "ru": "Сохранить этот EFT как новый фит и заменить привязку плана?",
    "en": "Save this EFT as a new fit and replace the plan's linked fit?"
  },
  "fits_198": {
    "ru": "Сохраняем фит и загружаем требования…",
    "en": "Saving fit and loading requirements…"
  },
  "fits_199": {
    "ru": "Загружаем корабль, модули и требования навыков из ESI…",
    "en": "Loading ship, modules and skill requirements from ESI…"
  },
  "fits_200": {
    "ru": "Добавляем навыки в план…",
    "en": "Adding skills to the plan…"
  },
  "fits_201": {
    "ru": "Фит сохранён и привязан к плану",
    "en": "Fit saved and linked to the plan"
  },
  "fits_202": {
    "ru": "Открываем библиотеку Pyfa…",
    "en": "Opening Pyfa library…"
  },
  "fits_203": {
    "ru": "Ищем в Pyfa…",
    "en": "Searching Pyfa…"
  },
  "fits_204": {
    "ru": "<p class=\"library-empty\">Фиты не найдены.</p>",
    "en": "<p class=\"library-empty\">No fits found.</p>"
  },
  "fits_205": {
    "ru": "{0}{1} фитов · нажмите для импорта",
    "en": "{0}{1} fits · click to import"
  },
  "fits_206": {
    "ru": "Открываем фиты…",
    "en": "Opening fits…"
  },
  "fits_207": {
    "ru": "Читаем Pyfa…",
    "en": "Reading Pyfa…"
  },
  "fits_208": {
    "ru": "Сохраняем фит…",
    "en": "Saving fit…"
  },
  "fits_209": {
    "ru": "Восстановить фит?",
    "en": "Restore this fit?"
  },
  "fits_210": {
    "ru": "Переместить фит в корзину? Его можно будет восстановить.",
    "en": "Move this fit to trash? You can restore it later."
  },
  "fits_211": {
    "ru": "Обновляем библиотеку фитов…",
    "en": "Updating fit library…"
  },
  "fits_212": {
    "ru": "Проверяем исходник Pyfa…",
    "en": "Checking Pyfa source…"
  },
  "fits_213": {
    "ru": "Проверяем исходный фит в Pyfa…",
    "en": "Checking the source fit in Pyfa…"
  },
  "fits_214": {
    "ru": "В Pyfa есть новая версия. Обновите фит, затем требования нужного плана.",
    "en": "A new version is available in Pyfa. Update the fit, then update the requirements of the relevant plan."
  },
  "fits_215": {
    "ru": "Фит совпадает с Pyfa.",
    "en": "The fit matches Pyfa."
  },
  "fits_216": {
    "ru": "Обновить фит из Pyfa? Привязанные планы сохранят прежнюю версию.",
    "en": "Update this fit from Pyfa? Linked plans will keep the previous version."
  },
  "fits_217": {
    "ru": "Обновляем фит…",
    "en": "Updating fit…"
  },
  "fits_218": {
    "ru": "Обновляем фит и загружаем требования навыков…",
    "en": "Updating fit and loading skill requirements…"
  },
  "fits_219": {
    "ru": "Отвязать фит? Навыки останутся в плане, защита требований фита будет снята.",
    "en": "Unlink this fit? Skills will remain in the plan, but fit requirements will no longer be protected."
  },
  "fits_220": {
    "ru": "Обновить требования плана до последней версии фита? Уже добавленные цели останутся.",
    "en": "Update the plan requirements to the latest fit version? Existing goals will be kept."
  },
  "fits_221": {
    "ru": "Обновляем требования фита…",
    "en": "Updating fit requirements…"
  },
  "fits_222": {
    "ru": "Фит отсутствует в библиотеке. Снимок плана сохранён.",
    "en": "The fit is missing from the library. The plan snapshot has been kept."
  },
  "fits_223": {
    "ru": "Импортируем требования из Pyfa…",
    "en": "Importing requirements from Pyfa…"
  },
  "fits_224": {
    "ru": "Импортируем фит и загружаем требования навыков из ESI…",
    "en": "Importing fit and loading skill requirements from ESI…"
  },
  "fits_225": {
    "ru": "Сохраняем фит в библиотеке…",
    "en": "Saving fit to library…"
  },
  "fits_226": {
    "ru": "Подключаем базу Pyfa…",
    "en": "Connecting Pyfa database…"
  },
  "fits_227": {
    "ru": "Подключаем базы Pyfa…",
    "en": "Connecting Pyfa databases…"
  },
  "groups_228": {
    "ru": "<label class=\"group-picker-row\"><input type=\"checkbox\" data-group-member=\"{0}\" {1}><span><strong>{2}</strong><small>{3} целей{4}</small></span></label>",
    "en": "<label class=\"group-picker-row\"><input type=\"checkbox\" data-group-member=\"{0}\" {1}><span><strong>{2}</strong><small>{3} goals{4}</small></span></label>"
  },
  "groups_229": {
    "ru": " · сохранённый снимок",
    "en": " · saved snapshot"
  },
  "groups_230": {
    "ru": "<p class=\"library-empty\">Нет подходящих планов. Сначала сохраните планы в библиотеку.</p>",
    "en": "<p class=\"library-empty\">No eligible plans. Save plans to the library first.</p>"
  },
  "groups_231": {
    "ru": "Выбрано: {0}",
    "en": "Selected: {0}"
  },
  "groups_232": {
    "ru": "Загружаем планы для группы…",
    "en": "Loading plans for the group…"
  },
  "groups_233": {
    "ru": "Состав группы",
    "en": "Group members"
  },
  "groups_234": {
    "ru": "Создать группу планов",
    "en": "Create plan group"
  },
  "groups_235": {
    "ru": "Новая группа",
    "en": "New group"
  },
  "groups_236": {
    "ru": "Обновить цели группы из сохранённых исходных планов? Очередь группы обновится автоматически.",
    "en": "Update group goals from the saved source plans? The group queue will update automatically."
  },
  "groups_237": {
    "ru": "Обновляем цели из исходных планов…",
    "en": "Updating goals from source plans…"
  },
  "groups_238": {
    "ru": "Планы в группе обновлены. Очередь обновляется автоматически.",
    "en": "Group plans updated. The queue is updating automatically."
  },
  "groups_239": {
    "ru": "Создать группу? Сохраните текущий план в библиотеку или отбросьте его изменения.",
    "en": "Create a group? Save the current plan to your library or discard its changes."
  },
  "groups_240": {
    "ru": "Собираем общую очередь группы…",
    "en": "Building the combined group queue…"
  },
  "groups_241": {
    "ru": "Черновик сохранён",
    "en": "Draft saved"
  },
  "groups_242": {
    "ru": "Группа сохранена. Очередь оптимизируется автоматически.",
    "en": "Group saved. The queue is being optimized automatically."
  },
  "journey_243": {
    "ru": "ГРУППА ПЛАНОВ",
    "en": "PLAN GROUP"
  },
  "journey_244": {
    "ru": "SKILLY · ПЛАН",
    "en": "SKILLY · PLAN"
  },
  "journey_245": {
    "ru": "общего плана",
    "en": "shared plan"
  },
  "journey_246": {
    "ru": "Ошибка расчёта",
    "en": "Calculation error"
  },
  "journey_247": {
    "ru": "Пересчёт очереди",
    "en": "Recalculating queue"
  },
  "journey_248": {
    "ru": "Копировать очередь",
    "en": "Copy queue"
  },
  "journey_249": {
    "ru": "Оптимизированная очередь · {0}",
    "en": "Optimized queue · {0}"
  },
  "journey_250": {
    "ru": "Уровни меняются для этой группы.",
    "en": "Levels are edited for this group."
  },
  "journey_251": {
    "ru": "Общие цели · очередь обновляется автоматически.",
    "en": "Shared goals · the queue updates automatically."
  },
  "plans_252": {
    "ru": "Отмена",
    "en": "Cancel"
  },
  "plans_253": {
    "ru": "Продолжить",
    "en": "Continue"
  },
  "plans_254": {
    "ru": "Отбросить изменения",
    "en": "Discard changes"
  },
  "plans_255": {
    "ru": "Сохранить в библиотеку",
    "en": "Save to library"
  },
  "plans_256": {
    "ru": "Ошибка сохранения",
    "en": "Save failed"
  },
  "plans_257": {
    "ru": "Есть изменения",
    "en": "Unsaved changes"
  },
  "plans_258": {
    "ru": "Сохранено",
    "en": "Saved"
  },
  "plans_259": {
    "ru": "Изменения ещё не сохранены в библиотеку",
    "en": "Changes have not been saved to the library yet"
  },
  "plans_260": {
    "ru": "План сохранён в библиотеку",
    "en": "Plan saved to the library"
  },
  "plans_261": {
    "ru": "Сохранить",
    "en": "Save"
  },
  "plans_262": {
    "ru": "Сохранить план",
    "en": "Save plan"
  },
  "plans_263": {
    "ru": "Сохраняем черновик…",
    "en": "Saving draft…"
  },
  "plans_264": {
    "ru": "Черновик не сохранён: {0}",
    "en": "Draft not saved: {0}"
  },
  "plans_265": {
    "ru": "Ошибка сохранения черновика",
    "en": "Draft save failed"
  },
  "plans_266": {
    "ru": "Сохраняем план в библиотеку…",
    "en": "Saving plan to library…"
  },
  "plans_267": {
    "ru": "План «{0}» сохранён",
    "en": "Plan “{0}” saved"
  },
  "plans_268": {
    "ru": "Создать новый план? Сохраните текущие изменения в библиотеку или отбросьте их.",
    "en": "Create a new plan? Save the current changes to your library or discard them."
  },
  "plans_269": {
    "ru": "Создаём новый план…",
    "en": "Creating new plan…"
  },
  "plans_270": {
    "ru": "{0} целей",
    "en": "{0} goals"
  },
  "plans_271": {
    "ru": "<button type=\"button\" class=\"saved-plan-row\" data-open-plan=\"{0}\" aria-label=\"Открыть план {1}\"><span class=\"saved-plan-info\"><strong>{2}{3}{4}</strong><small>{5}{6} · {7}</small></span></button>",
    "en": "<button type=\"button\" class=\"saved-plan-row\" data-open-plan=\"{0}\" aria-label=\"Open plan {1}\"><span class=\"saved-plan-info\"><strong>{2}{3}{4}</strong><small>{5}{6} · {7}</small></span></button>"
  },
  "plans_272": {
    "ru": "<span class=\"active-plan-badge\">ГРУППА · {0}</span>",
    "en": "<span class=\"active-plan-badge\">GROUP · {0}</span>"
  },
  "plans_273": {
    "ru": "<span class=\"active-plan-badge\">ОТКРЫТ</span>",
    "en": "<span class=\"active-plan-badge\">OPEN</span>"
  },
  "plans_274": {
    "ru": " · оптимизирован",
    "en": " · optimized"
  },
  "plans_275": {
    "ru": "Ничего не найдено.",
    "en": "Nothing found."
  },
  "plans_276": {
    "ru": "Пока нет сохранённых планов.<br>Создайте план, добавьте цели и сохраните его в библиотеку.",
    "en": "No saved plans yet.<br>Create a plan, add goals and save it to your library."
  },
  "plans_277": {
    "ru": "Некоторые файлы не удалось прочитать:\n{0}",
    "en": "Some files could not be read:\n{0}"
  },
  "plans_278": {
    "ru": "Открываем библиотеку…",
    "en": "Opening library…"
  },
  "plans_279": {
    "ru": "<span class=\"plan-group-badge\">группа</span>",
    "en": "<span class=\"plan-group-badge\">group</span>"
  },
  "plans_280": {
    "ru": "Активный план · {0}",
    "en": "Active plan · {0}"
  },
  "plans_281": {
    "ru": "<div class=\"plan-picker-section-title\">Остальные планы</div>",
    "en": "<div class=\"plan-picker-section-title\">Other plans</div>"
  },
  "plans_282": {
    "ru": "Планы не найдены",
    "en": "No plans found"
  },
  "plans_283": {
    "ru": "Пока нет сохранённых планов",
    "en": "No saved plans yet"
  },
  "plans_284": {
    "ru": "Загружаем планы…",
    "en": "Loading plans…"
  },
  "plans_285": {
    "ru": "Не удалось загрузить планы",
    "en": "Could not load plans"
  },
  "plans_286": {
    "ru": "Сохранить как",
    "en": "Save as"
  },
  "plans_287": {
    "ru": "Открыть другой план? В текущем черновике есть изменения, не сохранённые в библиотеку.",
    "en": "Open another plan? The current draft has changes that have not been saved to your library."
  },
  "plans_288": {
    "ru": "Открываем сохранённую очередь…",
    "en": "Opening saved queue…"
  },
  "plans_289": {
    "ru": "План открыт",
    "en": "Plan opened"
  },
  "plans_290": {
    "ru": "Неподдерживаемая версия файла плана",
    "en": "Unsupported plan file version"
  },
  "plans_291": {
    "ru": "Открыть файл и отменить несохранённые изменения текущего плана?",
    "en": "Open this file and discard unsaved changes to the current plan?"
  },
  "plans_292": {
    "ru": "План открыт. Сохраните его в библиотеку.",
    "en": "Plan opened. Save it to your library."
  },
  "plans_293": {
    "ru": "{0} — копия",
    "en": "{0} — copy"
  },
  "plans_294": {
    "ru": "Не удалось сохранить черновик: {0}",
    "en": "Could not save draft: {0}"
  },
  "queue_controls_295": {
    "ru": "Выбрано: {0} · Ctrl+C",
    "en": "Selected: {0} · Ctrl+C"
  },
  "queue_controls_296": {
    "ru": "Shift + клик · Ctrl+C",
    "en": "Shift + click · Ctrl+C"
  },
  "queue_controls_297": {
    "ru": "<tr class=\"queue-event queue-event-book\" data-book-id=\"{0}\"><td class=\"event-icon-cell\" aria-hidden=\"true\">▤</td><td colspan=\"8\"><div class=\"event-heading\"><strong>Купить и изучить книгу · {1}</strong><span>{2}</span></div><span class=\"book-event-cost\" data-book-price-id=\"{3}\">Цена Jita загружается…</span></td></tr>",
    "en": "<tr class=\"queue-event queue-event-book\" data-book-id=\"{0}\"><td class=\"event-icon-cell\" aria-hidden=\"true\">▤</td><td colspan=\"8\"><div class=\"event-heading\"><strong>Buy and inject skillbook · {1}</strong><span>{2}</span></div><span class=\"book-event-cost\" data-book-price-id=\"{3}\">Loading Jita price…</span></td></tr>"
  },
  "queue_controls_298": {
    "ru": "Цена Jita загружается…",
    "en": "Loading Jita price…"
  },
  "queue_controls_299": {
    "ru": "Скопировано уровней: {0}",
    "en": "Levels copied: {0}"
  },
  "queue_controls_300": {
    "ru": "Не удалось скопировать выбранные навыки",
    "en": "Could not copy selected skills"
  },
  "tracking_301": {
    "ru": "Нужны данные очереди ESI",
    "en": "ESI queue data required"
  },
  "tracking_302": {
    "ru": "Сверяем с привязанным планом…",
    "en": "Comparing with the assigned plan…"
  },
  "tracking_303": {
    "ru": "Очередь пуста — план не запущен",
    "en": "Queue empty — plan not started"
  },
  "tracking_304": {
    "ru": "План изучен",
    "en": "Plan completed"
  },
  "tracking_305": {
    "ru": "Очередь следует привязанному плану",
    "en": "Queue follows the assigned plan"
  },
  "tracking_306": {
    "ru": "Очередь отличается от привязанного плана · №{0}",
    "en": "Queue differs from the assigned plan · #{0}"
  },
  "tracking_307": {
    "ru": "В игре: {0}. По плану: {1}.",
    "en": "In game: {0}. In plan: {1}."
  },
  "tracking_308": {
    "ru": "В игре: {0}. Этот уровень не предусмотрен оставшейся очередью плана.",
    "en": "In game: {0}. This level is not part of the remaining plan queue."
  },
  "tracking_309": {
    "ru": "Не удалось сверить очередь",
    "en": "Could not compare queue"
  },
  "tracking_310": {
    "ru": "✓ По плану",
    "en": "✓ Matches plan"
  },
  "tracking_311": {
    "ru": "✓ План изучен",
    "en": "✓ Plan completed"
  },
  "tracking_312": {
    "ru": "⚠ Расхождение · №{0}",
    "en": "⚠ Difference · #{0}"
  },
  "tracking_313": {
    "ru": "⚠ Очередь пуста",
    "en": "⚠ Empty queue"
  },
  "tracking_314": {
    "ru": "⚠ Ошибка сверки",
    "en": "⚠ Comparison failed"
  },
  "tracking_315": {
    "ru": "Сверяем очередь…",
    "en": "Comparing queue…"
  },
  "tracking_316": {
    "ru": "Нажмите, чтобы открыть подробности",
    "en": "Click to view details"
  },
  "tracking_317": {
    "ru": "Открыть привязанный план «{0}»",
    "en": "Open assigned plan “{0}”"
  },
  "tracking_318": {
    "ru": "Навык #{0}",
    "en": "Skill #{0}"
  },
  "tracking_319": {
    "ru": "Изучается",
    "en": "Training"
  },
  "tracking_320": {
    "ru": "Частично изучен, не обучается",
    "en": "Partially trained, not training"
  },
  "tracking_321": {
    "ru": "<span class=\"queue-row-status\">В очереди ESI · №{0}</span>",
    "en": "<span class=\"queue-row-status\">In ESI queue · #{0}</span>"
  },
  "tracking_322": {
    "ru": "<tr class=\"learned-heading\"><td colspan=\"9\">Изучено по плану · {0} уровней</td></tr>",
    "en": "<tr class=\"learned-heading\"><td colspan=\"9\">Trained in plan · {0} levels</td></tr>"
  },
  "tracking_323": {
    "ru": "<tr class=\"learned-skill-row\" data-skill-id=\"{0}\" data-skill-level=\"{1}\"><td>✓</td><td>{2} <span class=\"roman-level\">{3}</span></td><td colspan=\"7\">Изучено</td></tr>",
    "en": "<tr class=\"learned-skill-row\" data-skill-id=\"{0}\" data-skill-level=\"{1}\"><td>✓</td><td>{2} <span class=\"roman-level\">{3}</span></td><td colspan=\"7\">Trained</td></tr>"
  },
  "tracking_324": {
    "ru": "<p class=\"muted-note\">Обновляем действия по плану…</p>",
    "en": "<p class=\"muted-note\">Updating plan actions…</p>"
  },
  "tracking_325": {
    "ru": "Книга: {0}",
    "en": "Book: {0}"
  },
  "tracking_326": {
    "ru": "Установить импланты",
    "en": "Install implants"
  },
  "tracking_327": {
    "ru": "через {0}",
    "en": "in {0}"
  },
  "tracking_328": {
    "ru": "Сейчас",
    "en": "Now"
  },
  "tracking_329": {
    "ru": "По очереди ESI",
    "en": "From ESI queue"
  },
  "tracking_330": {
    "ru": "Прогноз по плану",
    "en": "Plan forecast"
  },
  "tracking_331": {
    "ru": "{0} · {1}. {2}. Перейти к действию в очереди.",
    "en": "{0} · {1}. {2}. Jump to this action in the queue."
  },
  "tracking_332": {
    "ru": "<p class=\"muted-note\">Дополнительных действий нет.</p>",
    "en": "<p class=\"muted-note\">No additional actions.</p>"
  },
  "tracking_333": {
    "ru": "Очередь обновилась. Выберите действие ещё раз.",
    "en": "The queue has changed. Select the action again."
  },
  "tracking_334": {
    "ru": "Очередь · {0}",
    "en": "Queue · {0}"
  },
  "tracking_335": {
    "ru": "Данные ESI от {0}. Время обучения между обновлениями — прогноз по снимку.",
    "en": "ESI data from {0}. Training times between updates are estimated from the snapshot."
  },
  "tracking_336": {
    "ru": "Осталось {0}",
    "en": "Remaining {0}"
  },
  "tracking_337": {
    "ru": "Начало {0}",
    "en": "Starts {0}"
  },
  "tracking_338": {
    "ru": "Обучение приостановлено",
    "en": "Training paused"
  },
  "tracking_339": {
    "ru": "Изучается · ",
    "en": "Training · "
  },
  "tracking_340": {
    "ru": " · в плане",
    "en": " · in plan"
  },
  "tracking_341": {
    "ru": " · вне плана",
    "en": " · outside plan"
  },
  "tracking_342": {
    "ru": "Полная очередь ещё не загружена. Обновите данные ESI.",
    "en": "The full queue has not loaded yet. Refresh ESI data."
  },
  "tracking_343": {
    "ru": "По последнему снимку активная очередь пуста.",
    "en": "The active queue is empty in the latest snapshot."
  },
  "tracking_344": {
    "ru": "Показывать изученные",
    "en": "Show trained skills"
  },
  "tracking_345": {
    "ru": "{0} / {1} изучено",
    "en": "{0} / {1} trained"
  },
  "tracking_346": {
    "ru": "Ошибка ESI: {0}. Нажмите для повтора.",
    "en": "ESI error: {0}. Click to retry."
  },
  "tracking_347": {
    "ru": "ESI: {0} · автообновление каждые 5 минут. Обновить сейчас.",
    "en": "ESI: {0} · updates every 5 minutes. Refresh now."
  },
  "tracking_348": {
    "ru": "<p class=\"muted-note\">Загружаем очередь и условия ближайших действий…</p>",
    "en": "<p class=\"muted-note\">Loading queue and upcoming action requirements…</p>"
  },
  "updates_349": {
    "ru": "Не удалось открыть страницу скачивания",
    "en": "Could not open the download page"
  },
  "updates_350": {
    "ru": "Доступна Skilly {0}",
    "en": "Skilly {0} is available"
  },
  "html_351": {
    "ru": "Skilly — планирование обучения",
    "en": "Skilly — Skill Planner"
  },
  "html_352": {
    "ru": "План обучения",
    "en": "Training plan"
  },
  "html_353": {
    "ru": "Название плана",
    "en": "Plan name"
  },
  "html_354": {
    "ru": "группа",
    "en": "group"
  },
  "html_355": {
    "ru": "Изменить состав группы",
    "en": "Edit group members"
  },
  "html_356": {
    "ru": "Мои планы",
    "en": "My plans"
  },
  "html_357": {
    "ru": "Найти план…",
    "en": "Find a plan…"
  },
  "html_358": {
    "ru": "Поиск моих планов",
    "en": "Search my plans"
  },
  "html_359": {
    "ru": "+ Новый план",
    "en": "+ New plan"
  },
  "html_360": {
    "ru": "Открыть библиотеку →",
    "en": "Open library →"
  },
  "html_361": {
    "ru": "Контекст очереди",
    "en": "Queue context"
  },
  "html_362": {
    "ru": "Без персонажа",
    "en": "No character"
  },
  "html_363": {
    "ru": "Персонажи",
    "en": "Characters"
  },
  "html_364": {
    "ru": "Отслеживать план",
    "en": "Track plan"
  },
  "html_365": {
    "ru": "Отключить",
    "en": "Disconnect"
  },
  "html_366": {
    "ru": "Настройки персонажей",
    "en": "Character settings"
  },
  "html_367": {
    "ru": "Другие действия с планом",
    "en": "More plan actions"
  },
  "html_368": {
    "ru": "Открыть JSON",
    "en": "Open JSON"
  },
  "html_369": {
    "ru": "Сохранить копию…",
    "en": "Save a copy…"
  },
  "html_370": {
    "ru": "Экспорт плана JSON",
    "en": "Export plan JSON"
  },
  "html_371": {
    "ru": "Экспорт очереди .txt",
    "en": "Export queue .txt"
  },
  "html_372": {
    "ru": "Обновление приложения",
    "en": "App update"
  },
  "html_373": {
    "ru": "Скачать",
    "en": "Download"
  },
  "html_374": {
    "ru": "Закрыть уведомление об обновлении",
    "en": "Dismiss update notification"
  },
  "html_375": {
    "ru": "Закрыть",
    "en": "Close"
  },
  "html_376": {
    "ru": "Результат расчёта",
    "en": "Calculation result"
  },
  "html_377": {
    "ru": "Обучение",
    "en": "Training"
  },
  "html_378": {
    "ru": "Навыки",
    "en": "Skills"
  },
  "html_379": {
    "ru": "Оптимизация",
    "en": "Optimization"
  },
  "html_380": {
    "ru": "С бустером ",
    "en": "With booster "
  },
  "html_381": {
    "ru": "Книги · Jita ",
    "en": "Books · Jita "
  },
  "html_382": {
    "ru": "Очередь плана",
    "en": "Plan queue"
  },
  "html_383": {
    "ru": "Прогресс персонажа",
    "en": "Character progress"
  },
  "html_384": {
    "ru": "Сверка очереди с привязанным планом",
    "en": "Compare queue with assigned plan"
  },
  "html_385": {
    "ru": "Очередь ESI ↗",
    "en": "ESI queue ↗"
  },
  "html_386": {
    "ru": "Обновить ESI",
    "en": "Refresh ESI"
  },
  "html_387": {
    "ru": "Сортировка только внутри непрерывных групп с одинаковыми атрибутами. Зависимости и моменты remap и установки имплантов сохраняются.",
    "en": "Only sorts within continuous attribute groups. Prerequisites, remap timing and implant installation timing are preserved."
  },
  "html_388": {
    "ru": "Приоритет",
    "en": "Priority"
  },
  "html_389": {
    "ru": "Приоритет сортировки очереди",
    "en": "Queue sorting priority"
  },
  "html_390": {
    "ru": "Быстрее освоить фит",
    "en": "Fly the fit sooner"
  },
  "html_391": {
    "ru": "Дорогие книги позже · Jita",
    "en": "Expensive books later · Jita"
  },
  "html_392": {
    "ru": "Изученные",
    "en": "Trained skills"
  },
  "html_393": {
    "ru": "Снять выделение навыков",
    "en": "Clear skill selection"
  },
  "html_394": {
    "ru": "Снять выделение",
    "en": "Clear selection"
  },
  "html_395": {
    "ru": " Распределение по атрибутам",
    "en": " Attribute distribution"
  },
  "html_396": {
    "ru": "Распределение времени по парам атрибутов",
    "en": "Training time by attribute pair"
  },
  "html_397": {
    "ru": "Навык",
    "en": "Skill"
  },
  "html_398": {
    "ru": "Время",
    "en": "Time"
  },
  "html_399": {
    "ru": "Множитель сложности навыка",
    "en": "Skill training multiplier"
  },
  "html_400": {
    "ru": "Основной",
    "en": "Primary"
  },
  "html_401": {
    "ru": "Вторичный",
    "en": "Secondary"
  },
  "html_402": {
    "ru": "SP/Ч",
    "en": "SP/h"
  },
  "html_403": {
    "ru": "Уровень",
    "en": "Level"
  },
  "html_404": {
    "ru": "После этого уровня — сколько инжекторов нужно на оставшиеся цели плана",
    "en": "Injectors needed for the remaining goals after this level"
  },
  "html_405": {
    "ru": "Инжекторов до цели",
    "en": "Injectors to goal"
  },
  "html_406": {
    "ru": "Large · после уровня",
    "en": "Large · after level"
  },
  "html_407": {
    "ru": "Начните план с фита или навыка",
    "en": "Start a plan with a fit or skill"
  },
  "html_408": {
    "ru": "Вставьте EFT-фит или добавьте навык справа.",
    "en": "Paste an EFT fit or add a skill on the right."
  },
  "html_409": {
    "ru": "Требования и предыдущие уровни появятся автоматически.",
    "en": "Prerequisites and preceding levels are added automatically."
  },
  "html_410": {
    "ru": "Как рассчитано",
    "en": "How this is calculated"
  },
  "html_411": {
    "ru": "Настройки и цели плана",
    "en": "Plan settings and goals"
  },
  "html_412": {
    "ru": "Ближайшие действия",
    "en": "Upcoming actions"
  },
  "html_413": {
    "ru": "Фит корабля ",
    "en": "Ship fit "
  },
  "html_414": {
    "ru": "Обновить требования",
    "en": "Update requirements"
  },
  "html_415": {
    "ru": "Заменить фит",
    "en": "Replace fit"
  },
  "html_416": {
    "ru": "Отмена замены",
    "en": "Cancel replacement"
  },
  "html_417": {
    "ru": "Отвязать",
    "en": "Unlink"
  },
  "html_418": {
    "ru": "Из библиотеки",
    "en": "From library"
  },
  "html_419": {
    "ru": "Найти в Pyfa",
    "en": "Find in Pyfa"
  },
  "html_420": {
    "ru": "Вставьте фит целиком, включая пометки мутированных модулей.",
    "en": "Paste the entire fit, including mutated module annotations."
  },
  "html_421": {
    "ru": "Фит в формате EFT",
    "en": "Fit in EFT format"
  },
  "html_422": {
    "ru": "Импорт EFT",
    "en": "EFT import"
  },
  "html_423": {
    "ru": "Требования загружаются из публичного ESI. Логин не нужен.",
    "en": "Requirements load from public ESI. No sign-in required."
  },
  "html_424": {
    "ru": "Цели плана ",
    "en": "Plan goals "
  },
  "html_425": {
    "ru": "Название на английском…",
    "en": "English skill name…"
  },
  "html_426": {
    "ru": "Название навыка",
    "en": "Skill name"
  },
  "html_427": {
    "ru": "Целевой уровень",
    "en": "Target level"
  },
  "html_428": {
    "ru": "+ Добавить",
    "en": "+ Add"
  },
  "html_429": {
    "ru": "Изменения целей затрагивают общий план и все его персональные маршруты.",
    "en": "Goal changes affect the shared plan and all its character adaptations."
  },
  "html_430": {
    "ru": "Лимит remap в плане",
    "en": "Plan remap limit"
  },
  "html_431": {
    "ru": "Дополнительный remap в начале — по вашему выбору. Обычный remap восстанавливается раз в год.",
    "en": "An extra initial remap is optional. A regular remap becomes available once a year."
  },
  "html_432": {
    "ru": "Использовать значение ESI",
    "en": "Use ESI value"
  },
  "html_433": {
    "ru": "Учебные импланты",
    "en": "Training implants"
  },
  "html_434": {
    "ru": " Планировать покупку учебных имплантов",
    "en": " Plan training implant purchases"
  },
  "html_435": {
    "ru": " Разрешить замену установленных имплантов",
    "en": " Allow replacing installed implants"
  },
  "html_436": {
    "ru": "Базовые атрибуты ",
    "en": "Base attributes "
  },
  "html_437": {
    "ru": "Каждый 17–27 · сумма 99 · без имплантов",
    "en": "Each 17–27 · total 99 · excluding implants"
  },
  "html_438": {
    "ru": "Инжекторы",
    "en": "Injectors"
  },
  "html_439": {
    "ru": "Инжектор",
    "en": "Injector"
  },
  "html_440": {
    "ru": " Учитывать свободные SP персонажа",
    "en": " Include character unallocated SP"
  },
  "html_441": {
    "ru": "Колонка показывает, сколько банок нужно после обучения до каждой строки. Значения строк не суммируются.",
    "en": "This column shows injectors needed after training through each row. Do not add the row values together."
  },
  "html_442": {
    "ru": "Общие SP для расчёта",
    "en": "Total SP for calculation"
  },
  "html_443": {
    "ru": "Общие SP при старте",
    "en": "Starting total SP"
  },
  "html_444": {
    "ru": "Сбросить SP к исходным",
    "en": "Reset SP to original value"
  },
  "html_445": {
    "ru": "Данные персонажа",
    "en": "Character data"
  },
  "html_446": {
    "ru": "Закрыть библиотеку",
    "en": "Close library"
  },
  "html_447": {
    "ru": "ВАШИ УЧЕБНЫЕ ЦЕЛИ",
    "en": "YOUR TRAINING GOALS"
  },
  "html_448": {
    "ru": "Библиотека",
    "en": "Library"
  },
  "html_449": {
    "ru": "Планы, группы очередей и сохранённые фиты кораблей.",
    "en": "Plans, queue groups and saved ship fits."
  },
  "html_450": {
    "ru": "Тип плана",
    "en": "Plan type"
  },
  "html_451": {
    "ru": "Все",
    "en": "All"
  },
  "html_452": {
    "ru": "Планы",
    "en": "Plans"
  },
  "html_453": {
    "ru": "Группы",
    "en": "Groups"
  },
  "html_454": {
    "ru": "Фиты",
    "en": "Fits"
  },
  "html_455": {
    "ru": "Поиск по названию",
    "en": "Search by name"
  },
  "html_456": {
    "ru": "Поиск в библиотеке",
    "en": "Search library"
  },
  "html_457": {
    "ru": "Объединить в группу",
    "en": "Combine into group"
  },
  "html_458": {
    "ru": "Вставить EFT",
    "en": "Paste EFT"
  },
  "html_459": {
    "ru": " Корзина фитов",
    "en": " Fit trash"
  },
  "html_460": {
    "ru": "Список планов",
    "en": "Plan list"
  },
  "html_461": {
    "ru": "План — набор целевых навыков. Группа объединяет несколько сохранённых планов. Для любого из них можно рассчитать отдельный маршрут под персонажа.",
    "en": "A plan is a set of skill goals. A group combines saved plans. Each can have a separate character adaptation."
  },
  "html_462": {
    "ru": "Закрыть окно персонажей",
    "en": "Close characters window"
  },
  "html_463": {
    "ru": "Подключите пилота, чтобы учитывать изученные навыки, атрибуты и импланты.",
    "en": "Connect a pilot to account for trained skills, attributes and implants."
  },
  "html_464": {
    "ru": "Список персонажей и настройка SSO",
    "en": "Character list and SSO setup"
  },
  "html_465": {
    "ru": "Подключить персонажа через EVE SSO",
    "en": "Connect character via EVE SSO"
  },
  "html_466": {
    "ru": "Для каждого персонажа создаётся отдельная адаптация текущего плана. Общая очередь не меняется. Подключённые данные кэшируются локально; обновление запускается кнопкой «Обновить ESI».",
    "en": "Each character gets a separate adaptation of the current plan. The shared queue stays unchanged. Connected data is cached locally; use Refresh ESI to update it."
  },
  "html_467": {
    "ru": "Закрыть окно сохранения",
    "en": "Close save dialog"
  },
  "html_468": {
    "ru": "Название",
    "en": "Name"
  },
  "html_469": {
    "ru": "Закрыть состав группы",
    "en": "Close group members"
  },
  "html_470": {
    "ru": "Одна очередь для нескольких фитов и любых других планов",
    "en": "One queue for multiple fits and other plans"
  },
  "html_471": {
    "ru": "Название группы",
    "en": "Group name"
  },
  "html_472": {
    "ru": "Повторяющиеся навыки объединяются до максимального уровня. Состав и изменения отдельных планов не влияют на группу до обновления.",
    "en": "Duplicate skills merge at the highest level. Changes to source plans and their goals do not affect this group until you update it."
  },
  "html_473": {
    "ru": "В исходных планах есть изменения",
    "en": "Source plans have changed"
  },
  "html_474": {
    "ru": "Обновить цели",
    "en": "Update goals"
  },
  "html_475": {
    "ru": "Поиск планов для группы",
    "en": "Search plans for group"
  },
  "html_476": {
    "ru": "Выбор планов группы",
    "en": "Select group plans"
  },
  "html_477": {
    "ru": "Сохранить группу",
    "en": "Save group"
  },
  "html_478": {
    "ru": "Закрыть сравнение",
    "en": "Close comparison"
  },
  "html_479": {
    "ru": "Бустеры · Cerebral accelerators",
    "en": "Boosters · Cerebral accelerators"
  },
  "html_480": {
    "ru": "Количество",
    "en": "Quantity"
  },
  "html_481": {
    "ru": "Biology при старте",
    "en": "Starting Biology level"
  },
  "html_482": {
    "ru": "Использовать Biology персонажа",
    "en": "Use character Biology"
  },
  "html_483": {
    "ru": "Добавить свой бустер",
    "en": "Add custom booster"
  },
  "html_484": {
    "ru": "Название бустера",
    "en": "Booster name"
  },
  "html_485": {
    "ru": "Бонус ко всем атрибутам",
    "en": "Bonus to all attributes"
  },
  "html_486": {
    "ru": "Базовая длительность, часы",
    "en": "Base duration, hours"
  },
  "html_487": {
    "ru": "Применить до (UTC, необязательно)",
    "en": "Use by (UTC, optional)"
  },
  "html_488": {
    "ru": "Сравнение и подробности бустеров",
    "en": "Booster comparison and details"
  },
  "html_489": {
    "ru": "Условия расчёта и ограничения",
    "en": "Calculation assumptions and limits"
  },
  "html_490": {
    "ru": "Бустеры применяются последовательно с начала очереди, без наложения. Biology учитывается при каждой дозе. Для своих / ивентовых типов проверьте срок годности и ограничения возраста персонажа в игре. Уже активный бустер не учитывается. Omega; порядок навыков, remap и покупки имплантов сохраняются.",
    "en": "Boosters are applied sequentially from the start of the queue, without overlap. Biology is checked for each dose. Check expiration dates and character age restrictions in the game for custom or event boosters. Already active boosters are not included. Assumes Omega; skill order, remaps and implant purchases are preserved."
  },
  "html_491": {
    "ru": "Закрыть стоимость книг",
    "en": "Close book costs"
  },
  "html_492": {
    "ru": "Покупка книг навыков",
    "en": "Skillbook purchases"
  },
  "html_493": {
    "ru": "Обновить цены Jita",
    "en": "Refresh Jita prices"
  },
  "html_494": {
    "ru": "Стоимость и список книг",
    "en": "Book costs and list"
  },
  "html_495": {
    "ru": "Как считаются книги и цены",
    "en": "How books and prices are calculated"
  },
  "html_496": {
    "ru": "Одна книга на уникальный навык, включая prerequisites и дополнительные навыки оптимизации. Для персонажа уже введённые навыки исключаются, даже при 0 SP. Книги в ангаре не проверяются.",
    "en": "One book per unique skill, including prerequisites and extra optimization skills. Already injected character skills are excluded, even at 0 SP. Books in your hangar are not checked."
  },
  "html_497": {
    "ru": "Источник как в Pyfa: Fuzzwork, Jita 4-4, sell.percentile. Это рыночная оценка покупки; фактические ордера могут измениться. Если цены Jita нет, сумма остаётся неполной — каталог и другие регионы не подставляются. Покупки в игре не выполняются.",
    "en": "Same source as Pyfa: Fuzzwork, Jita 4-4, sell.percentile. This is a market purchase estimate; actual orders may change. Without a Jita price, the total stays incomplete — catalogue prices and other regions are not substituted. No in-game purchases are made."
  },
  "html_498": {
    "ru": "Книга",
    "en": "Book"
  },
  "html_499": {
    "ru": "Проверено",
    "en": "Checked"
  },
  "html_500": {
    "ru": "Закрыть подтверждение",
    "en": "Close confirmation"
  },
  "html_501": {
    "ru": "Текущий план",
    "en": "Current plan"
  },
  "html_502": {
    "ru": "Закрыть фит",
    "en": "Close fit"
  },
  "html_503": {
    "ru": "Фит корабля",
    "en": "Ship fit"
  },
  "html_504": {
    "ru": "Название фита",
    "en": "Fit name"
  },
  "html_505": {
    "ru": "Обработка фита",
    "en": "Processing fit"
  },
  "html_506": {
    "ru": "Представление фита",
    "en": "Fit view"
  },
  "html_507": {
    "ru": "Состав фита",
    "en": "Fit contents"
  },
  "html_508": {
    "ru": "Редактировать EFT",
    "en": "Edit EFT"
  },
  "html_509": {
    "ru": "Текст фита · EFT",
    "en": "Fit text · EFT"
  },
  "html_510": {
    "ru": "Другие действия с фитом",
    "en": "More fit actions"
  },
  "html_511": {
    "ru": "Другие действия ▾",
    "en": "More actions ▾"
  },
  "html_512": {
    "ru": "Проверить обновления Pyfa",
    "en": "Check Pyfa updates"
  },
  "html_513": {
    "ru": "Обновить из Pyfa",
    "en": "Update from Pyfa"
  },
  "html_514": {
    "ru": "Сохранить изменения",
    "en": "Save changes"
  },
  "html_515": {
    "ru": "Добавить в текущий план",
    "en": "Add to current plan"
  },
  "html_516": {
    "ru": "Закрыть поиск Pyfa",
    "en": "Close Pyfa search"
  },
  "html_517": {
    "ru": "Импорт из Pyfa",
    "en": "Import from Pyfa"
  },
  "html_518": {
    "ru": "Поиск по названию фита и кораблю. База Pyfa доступна только для чтения.",
    "en": "Search by fit or ship name. The Pyfa database is read-only."
  },
  "html_519": {
    "ru": "Поиск в Pyfa",
    "en": "Search Pyfa"
  },
  "html_520": {
    "ru": "Название фита или корабля…",
    "en": "Fit or ship name…"
  },
  "html_521": {
    "ru": "Расположение баз Pyfa",
    "en": "Pyfa database locations"
  },
  "html_522": {
    "ru": "База фитов · saveddata.db",
    "en": "Fit database · saveddata.db"
  },
  "html_523": {
    "ru": "Выбрать файл",
    "en": "Choose file"
  },
  "html_524": {
    "ru": "Данные предметов · eve.db",
    "en": "Item data · eve.db"
  },
  "html_525": {
    "ru": "Подключить",
    "en": "Connect"
  },
  "html_526": {
    "ru": "Закрыть очередь персонажа",
    "en": "Close character queue"
  },
  "html_527": {
    "ru": "Очередь персонажа",
    "en": "Character queue"
  },
  "html_528": {
    "ru": "Фактическая очередь ESI",
    "en": "Actual ESI queue"
  },
  "html_529": {
    "ru": "Порядок и даты из EVE Online. Сопоставление показано относительно открытого плана.",
    "en": "Order and dates from EVE Online. Queue entries are compared with the currently open plan."
  },
  "server_530": {
    "ru": "Обновите ESI и пересчитайте персонажа: в старом снимке нет общего количества SP",
    "en": "Refresh ESI and recalculate the character: the old snapshot has no total SP"
  },
  "server_531": {
    "ru": "Очередь содержит некорректную длительность или SP",
    "en": "The queue contains invalid durations or SP"
  },
  "server_532": {
    "ru": "Количество бустеров: 0–10000, Biology: 0–V, инжектор: Large или Small",
    "en": "Booster quantity: 0–10000; Biology: 0–V; injector: Large or Small"
  },
  "server_533": {
    "ru": "Некорректный бонус длительности бустеров",
    "en": "Invalid booster duration bonus"
  },
  "server_534": {
    "ru": "Общие SP должны включать нераспределённые SP и не превышать 1 трлн",
    "en": "Total SP must include unallocated SP and must not exceed 1 trillion"
  },
  "server_535": {
    "ru": "Укажите параметры ивентового бустера",
    "en": "Enter the event booster settings"
  },
  "server_536": {
    "ru": "Свой бустер: бонус >0 и ≤30, базовая длительность >0 и ≤1000 часов",
    "en": "Custom booster: bonus >0 and ≤30; base duration >0 and ≤1000 hours"
  },
  "server_537": {
    "ru": "Неизвестный cerebral accelerator",
    "en": "Unknown cerebral accelerator"
  },
  "server_538": {
    "ru": "Некорректное количество SP в целях",
    "en": "Invalid goal SP amount"
  },
  "server_539": {
    "ru": "Не удалось прочитать отметки покупок: {e}",
    "en": "Could not read purchase records: {e}"
  },
  "server_540": {
    "ru": "Нет ID фита",
    "en": "Fit ID missing"
  },
  "server_541": {
    "ru": "Сначала отвяжите фит от планов: {}",
    "en": "Unlink the fit from these plans first: {}"
  },
  "server_542": {
    "ru": "Нет ID фита Pyfa",
    "en": "Pyfa fit ID missing"
  },
  "server_543": {
    "ru": "Обновите ESI и пересчитайте адаптацию: в старом снимке нет списка введённых навыков",
    "en": "Refresh ESI and recalculate: the old snapshot has no injected skill list"
  },
  "server_544": {
    "ru": "Для подсчёта книг нужен снимок навыков персонажа",
    "en": "A character skill snapshot is required to count books"
  },
  "server_545": {
    "ru": "Сначала рассчитайте очередь для персонажа",
    "en": "Calculate a character queue first"
  },
  "server_546": {
    "ru": "Пересчитайте устаревшую адаптацию персонажа",
    "en": "Recalculate the outdated character adaptation"
  },
  "server_547": {
    "ru": "После обновления ESI нужно пересчитать очередь персонажа",
    "en": "Recalculate the character queue after refreshing ESI"
  },
  "server_548": {
    "ru": "Сначала соберите очередь обучения",
    "en": "Build a training queue first"
  },
  "server_549": {
    "ru": "Нет Character ID",
    "en": "Character ID missing"
  },
  "server_550": {
    "ru": "Нет привязанного плана",
    "en": "No assigned plan"
  },
  "server_551": {
    "ru": "Некорректная отметка покупки",
    "en": "Invalid purchase record"
  },
  "server_552": {
    "ru": "Нет состояния покупки",
    "en": "Purchase status missing"
  },
  "server_553": {
    "ru": "Название слишком длинное",
    "en": "Name is too long"
  },
  "server_554": {
    "ru": "Укажите название навыка, а не предмета",
    "en": "Enter a skill name, not an item name"
  },
  "server_555": {
    "ru": "Нет EFT-текста",
    "en": "EFT text missing"
  },
  "server_556": {
    "ru": "Нет ID плана",
    "en": "Plan ID missing"
  },
  "server_557": {
    "ru": "Нет названия",
    "en": "Name missing"
  },
  "server_558": {
    "ru": "Неизвестный API",
    "en": "Unknown API"
  },
  "server_559": {
    "ru": "Не удалось получить цены Jita 4-4",
    "en": "Could not fetch Jita 4-4 prices"
  },
  "server_560": {
    "ru": "Цены Jita: HTTP {}",
    "en": "Jita prices: HTTP {}"
  },
  "server_561": {
    "ru": "Некорректный ответ цен Jita",
    "en": "Invalid Jita price response"
  },
  "server_562": {
    "ru": "Некорректный формат цен Jita",
    "en": "Invalid Jita price format"
  },
  "server_563": {
    "ru": "Слишком много книг",
    "en": "Too many books"
  },
  "server_564": {
    "ru": "{error}. Используем сохранённые цены Jita; неизвестные цены не считаются нулевыми.",
    "en": "{error}. Using cached Jita prices; unknown prices are not treated as zero."
  },
  "server_565": {
    "ru": "Не удалось сохранить кэш цен: {error}",
    "en": "Could not save price cache: {error}"
  },
  "server_566": {
    "ru": "Повреждён кэш: {e}",
    "en": "Corrupted cache: {e}"
  },
  "server_567": {
    "ru": "Не найден тип: {name}. Нужны английские названия EVE.",
    "en": "Type not found: {name}. English EVE names are required."
  },
  "server_568": {
    "ru": "Тип {id} не является навыком",
    "en": "Type {id} is not a skill"
  },
  "server_569": {
    "ru": "Цикл/слишком глубокая цепочка ESI",
    "en": "Cyclic or excessively deep ESI dependency chain"
  },
  "server_570": {
    "ru": "Неизвестный primary attribute",
    "en": "Unknown primary attribute"
  },
  "server_571": {
    "ru": "Неизвестный secondary attribute",
    "en": "Unknown secondary attribute"
  },
  "server_572": {
    "ru": "Не удалось запустить {executable}: {e}. Установите curl для загрузки новых данных ESI.",
    "en": "Could not start {executable}: {e}. Install curl to download new ESI data."
  },
  "server_573": {
    "ru": "Нет stdin curl",
    "en": "curl stdin unavailable"
  },
  "server_574": {
    "ru": "ESI недоступен: {}. Уже загруженные типы работают офлайн.",
    "en": "ESI unavailable: {}. Previously loaded types work offline."
  },
  "server_575": {
    "ru": "Некорректный ответ ESI: {e}",
    "en": "Invalid ESI response: {e}"
  },
  "server_576": {
    "ru": "Пустой EFT",
    "en": "Empty EFT"
  },
  "server_577": {
    "ru": "EFT должен начинаться с [Ship, Fit name]",
    "en": "EFT must start with [Ship, Fit name]"
  },
  "server_578": {
    "ru": "Вставьте один EFT-фит",
    "en": "Paste a single EFT fit"
  },
  "server_579": {
    "ru": "Слишком много типов в фите",
    "en": "Too many types in the fit"
  },
  "server_580": {
    "ru": "Снимки персонажей: {e}",
    "en": "Character snapshots: {e}"
  },
  "server_581": {
    "ru": "Персонаж не подключён",
    "en": "Character not connected"
  },
  "server_582": {
    "ru": "Некорректный endpoint EVE SSO",
    "en": "Invalid EVE SSO endpoint"
  },
  "server_583": {
    "ru": "Неожиданный endpoint EVE SSO",
    "en": "Unexpected EVE SSO endpoint"
  },
  "server_584": {
    "ru": "Не удалось связаться с EVE SSO / ESI. Проверьте интернет.",
    "en": "Could not connect to EVE SSO / ESI. Check your internet connection."
  },
  "server_585": {
    "ru": ". Подключите персонажа заново.",
    "en": ". Connect the character again."
  },
  "server_586": {
    "ru": ". Попробуйте обновить позднее.",
    "en": ". Try refreshing later."
  },
  "server_587": {
    "ru": "Некорректный ответ EVE SSO / ESI",
    "en": "Invalid EVE SSO / ESI response"
  },
  "server_588": {
    "ru": "Некорректный токен EVE SSO",
    "en": "Invalid EVE SSO token"
  },
  "server_589": {
    "ru": "Неподдерживаемая подпись EVE SSO",
    "en": "Unsupported EVE SSO signature"
  },
  "server_590": {
    "ru": "В токене отсутствует kid",
    "en": "Token kid missing"
  },
  "server_591": {
    "ru": "Неизвестный ключ EVE SSO",
    "en": "Unknown EVE SSO key"
  },
  "server_592": {
    "ru": "Ключ EVE SSO повреждён",
    "en": "Corrupted EVE SSO key"
  },
  "server_593": {
    "ru": "Подпись или срок действия токена EVE SSO недействительны",
    "en": "EVE SSO token signature or expiration is invalid"
  },
  "server_594": {
    "ru": "Токен предназначен другому приложению",
    "en": "The token belongs to another application"
  },
  "server_595": {
    "ru": "Разрешите чтение навыков, очереди и имплантов в EVE SSO",
    "en": "Allow reading skills, queue and implants in EVE SSO"
  },
  "server_596": {
    "ru": "Нет Character ID в EVE SSO",
    "en": "Character ID missing from EVE SSO"
  },
  "server_597": {
    "ru": "Нет доступа к персонажу. Подключите его заново.",
    "en": "No access to the character. Connect it again."
  },
  "server_598": {
    "ru": "Повреждено хранилище токенов",
    "en": "Corrupted token storage"
  },
  "server_599": {
    "ru": "Не удалось прочитать токен",
    "en": "Could not read token"
  },
  "server_600": {
    "ru": "SSO вернул другого персонажа",
    "en": "SSO returned a different character"
  },
  "server_601": {
    "ru": "Порт callback 17422 занят. Дождитесь завершения предыдущего подключения или закройте второе окно Skilly.",
    "en": "Callback port 17422 is busy. Wait for the previous sign-in to finish or close the second Skilly window."
  },
  "server_602": {
    "ru": "Завершите подключение персонажа в браузере",
    "en": "Complete character sign-in in your browser"
  },
  "server_603": {
    "ru": "Персонаж подключён",
    "en": "Character connected"
  },
  "server_604": {
    "ru": "Подключение отменено в EVE SSO",
    "en": "Sign-in cancelled in EVE SSO"
  },
  "server_605": {
    "ru": "Читаем навыки, импланты и атрибуты персонажа…",
    "en": "Reading character skills, implants and attributes…"
  },
  "server_606": {
    "ru": "EVE SSO не вернул refresh token",
    "en": "EVE SSO did not return a refresh token"
  },
  "server_607": {
    "ru": "Время подключения истекло. Нажмите «Подключить персонажа» ещё раз.",
    "en": "Sign-in timed out. Click Connect character again."
  },
  "server_608": {
    "ru": "Не удалось получить случайные данные",
    "en": "Could not obtain random data"
  },
  "server_609": {
    "ru": "Некорректный callback",
    "en": "Invalid callback"
  },
  "server_610": {
    "ru": "Некорректный Host callback",
    "en": "Invalid callback Host"
  },
  "server_611": {
    "ru": "Повторный параметр callback",
    "en": "Duplicate callback parameter"
  },
  "server_612": {
    "ru": "Состояние SSO не совпадает",
    "en": "SSO state mismatch"
  },
  "server_613": {
    "ru": "Расчёт для Omega: обнаружены ограничения активных уровней. Alpha не моделируется.",
    "en": "Omega calculation: restricted active levels detected. Alpha is not modeled."
  },
  "server_614": {
    "ru": "Некорректные SP персонажа",
    "en": "Invalid character SP"
  },
  "server_615": {
    "ru": "Не поддерживается бонус имплантов больше +5",
    "en": "Implant bonuses above +5 are not supported"
  },
  "server_616": {
    "ru": "Не удалось отделить базовые атрибуты от временных бонусов ESI. Обновите персонажа после окончания бустера.",
    "en": "Could not separate base attributes from temporary ESI bonuses. Refresh the character after the booster expires."
  },
  "server_617": {
    "ru": "Атрибуты персонажа вне допустимого remap. Обновите данные после окончания бустера.",
    "en": "Character attributes are outside valid remap bounds. Refresh data after the booster expires."
  },
  "server_618": {
    "ru": "В ESI обнаружен временный бонус атрибутов. Он исключён из расчёта: срок действия бустера неизвестен.",
    "en": "A temporary attribute bonus was detected in ESI. It is excluded because its expiration time is unknown."
  },
  "server_619": {
    "ru": "Некорректная дата remap ESI",
    "en": "Invalid ESI remap date"
  },
  "server_620": {
    "ru": "Больше 10 доступных remap пока не поддерживается",
    "en": "More than 10 available remaps are not supported yet"
  },
  "server_621": {
    "ru": "Некорректный ID фита",
    "en": "Invalid fit ID"
  },
  "server_622": {
    "ru": "Нет корабля",
    "en": "Ship missing"
  },
  "server_623": {
    "ru": "Название фита: от 1 до 120 символов",
    "en": "Fit name must be 1 to 120 characters"
  },
  "server_624": {
    "ru": "Черновик",
    "en": "Draft"
  },
  "server_625": {
    "ru": "Не удалось прочитать базу Pyfa: {e}",
    "en": "Could not read Pyfa database: {e}"
  },
  "server_626": {
    "ru": "Pyfa: нет названия Type #{id}",
    "en": "Pyfa: name missing for Type #{id}"
  },
  "server_627": {
    "ru": "Группа должна содержать от 1 до 100 планов",
    "en": "A group must contain 1 to 100 plans"
  },
  "server_628": {
    "ru": "Один план выбран несколько раз",
    "en": "The same plan was selected more than once"
  },
  "server_629": {
    "ru": "Некорректный уровень навыка в группе",
    "en": "Invalid group skill level"
  },
  "server_630": {
    "ru": "Некорректный целевой уровень в группе",
    "en": "Invalid group target level"
  },
  "server_631": {
    "ru": "В группе больше 1000 целей",
    "en": "The group has more than 1000 goals"
  },
  "server_632": {
    "ru": "Название группы: от 1 до 120 символов",
    "en": "Group name must be 1 to 120 characters"
  },
  "server_633": {
    "ru": "Выберите от 1 до 100 планов",
    "en": "Select 1 to 100 plans"
  },
  "server_634": {
    "ru": "Не удалось загрузить участника группы: {error}",
    "en": "Could not load group member: {error}"
  },
  "server_635": {
    "ru": "В группу можно добавлять отдельные планы. Вложенные группы пока не поддерживаются.",
    "en": "Groups can contain individual plans. Nested groups are not supported yet."
  },
  "server_636": {
    "ru": "Базовые атрибуты: каждый 17–27, сумма 99",
    "en": "Base attributes: each 17–27, total 99"
  },
  "server_637": {
    "ru": "Импланты: бонус 0–5, день покупки ≥ 0",
    "en": "Implants: bonus 0–5, purchase day ≥0"
  },
  "server_638": {
    "ru": "Будущие покупки должны повышать или сохранять бонус каждого атрибута",
    "en": "Future purchases must increase or maintain each attribute bonus"
  },
  "server_639": {
    "ru": "Некорректные SP или уровень цели",
    "en": "Invalid SP or target level"
  },
  "server_640": {
    "ru": "Количество доступных remap: от 0 до 10",
    "en": "Available remaps must be between 0 and 10"
  },
  "server_641": {
    "ru": "Текущие импланты требуют уже изученный Cybernetics (rank 3). Укажите SP или добавьте их как будущую покупку.",
    "en": "Current implants require already trained Cybernetics (rank 3). Enter its SP or add implants as a future purchase."
  },
  "server_642": {
    "ru": "Слишком большой план (максимум 1000 целей / 100 покупок)",
    "en": "Plan is too large (maximum 1000 goals / 100 purchases)"
  },
  "server_643": {
    "ru": "Циклическая зависимость навыков",
    "en": "Cyclic skill dependency"
  },
  "server_644": {
    "ru": "Нет данных навыка {id}. Загрузите его из ESI.",
    "en": "No data for skill {id}. Load it from ESI."
  },
  "server_645": {
    "ru": "Некорректный уровень зависимости {}",
    "en": "Invalid prerequisite level {}"
  },
  "server_646": {
    "ru": "Некорректные данные {}",
    "en": "Invalid data {}"
  },
  "server_647": {
    "ru": "Очередь слишком большая (максимум 2000 уровней)",
    "en": "Queue is too large (maximum 2000 levels)"
  },
  "server_648": {
    "ru": "Слишком большой токен",
    "en": "Token is too large"
  },
  "server_649": {
    "ru": "Хранилище Windows DPAPI: {}",
    "en": "Windows DPAPI storage: {}"
  },
  "server_650": {
    "ru": "Безопасное хранение EVE SSO пока поддерживается в Windows-версии",
    "en": "Secure EVE SSO storage is currently supported in the Windows version"
  },
  "server_651": {
    "ru": "Skilly — {url}\nДанные: {}\nCtrl+C для выхода",
    "en": "Skilly — {url}\nData: {}\nCtrl+C to exit"
  },
  "server_652": {
    "ru": "Не удалось прочитать черновик: {e}",
    "en": "Could not read draft: {e}"
  },
  "server_653": {
    "ru": "Не удалось прочитать привязки планов: {e}",
    "en": "Could not read plan assignments: {e}"
  },
  "server_654": {
    "ru": "Не удалось прочитать старый plan.json: {e}",
    "en": "Could not read legacy plan.json: {e}"
  },
  "server_655": {
    "ru": "Некорректный ID плана",
    "en": "Invalid plan ID"
  },
  "server_656": {
    "ru": "План недоступен",
    "en": "Plan unavailable"
  },
  "server_657": {
    "ru": "Отслеживаемый план изменился. Обновите список персонажей и повторите действие.",
    "en": "The tracked plan has changed. Refresh the character list and try again."
  },
  "server_658": {
    "ru": "Не удалось открыть план: {e}",
    "en": "Could not open plan: {e}"
  },
  "server_659": {
    "ru": "Повреждён файл плана: {e}",
    "en": "Corrupted plan file: {e}"
  },
  "server_660": {
    "ru": "Неподдерживаемый формат плана",
    "en": "Unsupported plan format"
  },
  "server_661": {
    "ru": "Название плана: от 1 до 120 символов",
    "en": "Plan name must be 1 to 120 characters"
  },
  "server_663": {
    "ru": "Нарушены зависимости при сортировке очереди",
    "en": "Prerequisites violated while sorting the queue"
  },
  "server_664": {
    "ru": "Внутри групп атрибутов сначала обязательные уровни фита, затем короткие цели.",
    "en": "Within attribute groups, required fit levels come first, followed by short goals."
  },
  "server_665": {
    "ru": "Внутри групп атрибутов сначала открытые навыки и дешёвые книги Jita, затем дорогие; неизвестные цены — после известных. Это эвристика, без гарантии оптимального графика расходов.",
    "en": "Within attribute groups, injected skills and cheap Jita books come first, followed by expensive ones; unknown prices come after known prices. This is a heuristic, with no guarantee of an optimal spending schedule."
  },
  "server_666": {
    "ru": " Нет цены Jita для {missing_prices} книг; их стоимость не считается нулевой.",
    "en": " Jita prices are missing for {missing_prices} books; their cost is not treated as zero."
  },
  "server_667": {
    "ru": "{priority_note}{price_note} Для каждого проверенного порядка: точный выбор атрибутов и точек remap динамическим программированием. Порядок очереди и стратегия Cybernetics/имплантов выбираются эвристически. Omega, без бустеров и инжекторов. Учебные импланты доступны без ограничений ISK; покупка и установка перед первым использованием после Cybernetics. Годовое восстановление remap не моделируется.",
    "en": "{priority_note}{price_note} For each evaluated order, attributes and remap points are selected exactly using dynamic programming. Queue order and the Cybernetics/implant strategy use heuristics. Assumes Omega, without boosters or injectors. Training implants have no ISK limit; purchase and installation occur before their first use, after Cybernetics. Annual remap recovery is not modeled."
  },
  "language_label": {
    "ru": "Язык интерфейса",
    "en": "Interface language"
  },
  "language_saving": {
    "ru": "Сохраняем черновик перед сменой языка…",
    "en": "Saving draft before changing language…"
  },
  "language_error": {
    "ru": "Не удалось сохранить выбор языка",
    "en": "Could not save language preference"
  },
  "language_menu": {
    "ru": "Язык",
    "en": "Language"
  }
};
