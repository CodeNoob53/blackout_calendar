import {
    generateScheduleHash,
    schedulesAreIdentical,
    findScheduleDifferences,
    formatDifferencesDescription,
    generateZoeVersionId,
    generateTelegramVersionId
} from "../utils/versionHelper.js";
import { ScheduleRepository } from "../repositories/ScheduleRepository.js";
import Logger from "../utils/logger.js";

export class ScheduleProcessor {
    /**
     * Універсальний метод обробки знайденого графіка
     * @param {Object} context - Об'єкт з даними для обробки
     * @param {Object} Repository - Репозиторій (ZoeRepository або TelegramRepository)
     * @param {string} sourceName - 'zoe' або 'telegram'
     */
    static async process(context, Repository, sourceName) {
        const { parsed, metadata, rawContent, scheduleDate, messageDate } = context;

        // 1. Хешування контенту
        const contentHash = generateScheduleHash(parsed);

        // 2. Пошук попередньої версії (через переданий Репозиторій)
        const latestVersion = Repository.getLatestVersion(scheduleDate);

        // 3. Логіка порівняння контенту
        let changeType = 'new';
        let isIdentical = false;

        if (latestVersion) {
            if (schedulesAreIdentical(contentHash, latestVersion.content_hash)) {
                isIdentical = true;
                // Для Zoe: якщо контент ідентичний, ми взагалі пропускаємо
                if (sourceName === 'zoe') {
                    Logger.debug('ScheduleProcessor', `Zoe: Schedule for ${scheduleDate} unchanged`);
                    return { result: 'skipped', reason: 'identical' };
                }
                // Для Telegram: це новий пост з тим самим контентом - technically "updated" (repost)
                Logger.debug('ScheduleProcessor', `Telegram: Identical content in new post (re-post)`);
                changeType = 'updated';
            } else {
                // Контент змінився - логуємо різницю
                const oldData = JSON.parse(latestVersion.schedule_data);
                const differences = findScheduleDifferences(oldData, parsed);
                const diffDescription = formatDifferencesDescription(differences);
                Logger.info('ScheduleProcessor', `${sourceName}: Schedule for ${scheduleDate} changed: ${diffDescription}`);
                changeType = 'updated';
            }
        }

        // 4. Підготовка даних для версії
        let versionId;
        let versionNumber; // тільки для Zoe

        if (sourceName === 'zoe') {
            versionNumber = Repository.getNextVersionNumber(scheduleDate);
            versionId = generateZoeVersionId(scheduleDate, versionNumber);
        } else {
            versionId = generateTelegramVersionId(metadata.postId); // metadata.postId
        }

        // 5. Збереження версії
        // Для уніфікації нам треба, щоб Repository мав метод saveVersion з однаковою сигнатурою,
        // АБО ми робимо тут `if` (поки що простіше `if`)

        let saved = false;
        if (sourceName === 'zoe') {
            saved = Repository.saveVersion(
                versionId,
                scheduleDate,
                versionNumber,
                contentHash,
                parsed,
                metadata.snapshotId,
                changeType,
                messageDate, // site update time
                metadata.pagePosition
            );
        } else {
            // Telegram
            saved = Repository.saveVersion(
                versionId,
                scheduleDate,
                metadata.postId,
                messageDate,
                contentHash,
                parsed,
                metadata.snapshotId,
                changeType
            );
        }

        if (!saved) {
            // Зазвичай означає, що вже є запис (для TG це ок, для Zoe - помилка)
            if (sourceName === 'zoe') {
                Logger.error('ScheduleProcessor', `Failed to save version ${versionId}`);
            }
            return { result: 'skipped', reason: 'save-failed' };
        }

        // 6. Оновлення основної таблиці (Legacy / Compatibility layer)
        // Тут джерелом передаємо sourceName
        const legacyId = sourceName === 'zoe' ? versionNumber : metadata.postId;

        // ВАЖЛИВО: для Zoe використовуємо поточний час як messageDate якщо його немає на сайті
        const finalMessageDate = messageDate || new Date().toISOString();

        const legacyResult = ScheduleRepository.upsertSchedule(parsed, legacyId, finalMessageDate, sourceName);

        if (legacyResult.updated) {
            const logPrefix = changeType === 'new' ? 'New' : 'Updated';
            const idInfo = sourceName === 'zoe' ? `version ${versionNumber}` : `post ${metadata.postId}`;
            Logger.success('ScheduleProcessor', `${sourceName}: ${logPrefix} ${scheduleDate} (${idInfo})`);
            return {
                result: 'processed',
                changeType,
                versionId,
                messageDate: finalMessageDate
            };
        } else {
            return { result: 'skipped', reason: 'legacy-no-update' };
        }
    }
}
