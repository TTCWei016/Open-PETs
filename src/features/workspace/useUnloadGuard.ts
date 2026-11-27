/**
 * ============================================================================
 * 檔案名稱 (File): useUnloadGuard.ts
 * 模組功能 (Description): 運算進行中、或工作區已載入資料時，重新整理／關閉分頁前先跳出瀏覽器的離開確認。
 * ============================================================================
 * ★ 專家回饋 P-15：重新整理頁面會（1）中斷進行中的運算（瀏覽器斷線，後端偵測到就取消）、
 *   （2）清空工作區（上傳的檔案與各步驟設定只存在記憶體，不寫進瀏覽器——登出會清除瀏覽器端資料的隱私設計）。
 *   原本沒有任何提醒，使用者不小心按 F5 就整個重來。這裡只提醒，不改變「重新整理即清空」的設計。
 */
import { useEffect } from 'react';
import { isComputationRunning } from '../../utils/computationActivity';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';

/** 有運算在跑，或已上傳資料（有進度會遺失）時，才需要離開確認 */
export const shouldConfirmBeforeUnload = (): boolean =>
    isComputationRunning() || useWorkspaceStore.getState().dataFile !== null;

export const handleBeforeUnload = (unloadEvent: BeforeUnloadEvent): void =>
{
    if (!shouldConfirmBeforeUnload()) return;
    // 現代瀏覽器只要 preventDefault 就會顯示通用確認視窗（文字無法自訂）；returnValue 為相容舊瀏覽器
    unloadEvent.preventDefault();
    unloadEvent.returnValue = '';
};

/** 登入期間註冊 beforeunload；未登入（登入頁等）不需要 */
export function useUnloadGuard(isEnabled: boolean): void
{
    useEffect(() =>
    {
        if (!isEnabled) return;
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isEnabled]);
}
