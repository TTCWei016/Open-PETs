// @vitest-environment jsdom
/**
 * 專家回饋 P-15：運算中或已上傳資料時，重新整理／關閉分頁前要跳離開確認；沒有進度時不打擾。
 */
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { beginComputation } from '../computationActivity';
import { shouldConfirmBeforeUnload, useUnloadGuard } from '../../features/workspace/useUnloadGuard';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';

const fireBeforeUnload = (): boolean =>
{
    const unloadEvent = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unloadEvent);
    return unloadEvent.defaultPrevented;
};

describe('離開確認（beforeunload）', () =>
{
    afterEach(() => { useWorkspaceStore.getState().resetWorkspace(); });

    it('沒有運算、沒有上傳資料：不需要確認', () =>
    {
        expect(shouldConfirmBeforeUnload()).toBe(false);
    });

    it('已上傳資料：需要確認', () =>
    {
        useWorkspaceStore.setState({ dataFile: new File(['a'], 'a.csv') });
        expect(shouldConfirmBeforeUnload()).toBe(true);
    });

    it('運算進行中：需要確認，結束後恢復', () =>
    {
        const endComputation = beginComputation();
        expect(shouldConfirmBeforeUnload()).toBe(true);
        endComputation();
        expect(shouldConfirmBeforeUnload()).toBe(false);
    });

    it('啟用時：有資料才攔截；沒資料放行', () =>
    {
        const { unmount } = renderHook(() => useUnloadGuard(true));
        expect(fireBeforeUnload()).toBe(false);
        useWorkspaceStore.setState({ dataFile: new File(['a'], 'a.csv') });
        expect(fireBeforeUnload()).toBe(true);
        unmount();
    });

    it('未啟用（未登入）或卸載後：不攔截', () =>
    {
        useWorkspaceStore.setState({ dataFile: new File(['a'], 'a.csv') });
        const disabled = renderHook(() => useUnloadGuard(false));
        expect(fireBeforeUnload()).toBe(false);
        disabled.unmount();
        const enabled = renderHook(() => useUnloadGuard(true));
        enabled.unmount();
        expect(fireBeforeUnload()).toBe(false);
    });
});
