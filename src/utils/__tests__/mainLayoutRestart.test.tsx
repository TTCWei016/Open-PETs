// @vitest-environment jsdom
/**
 * 專家回饋 P-16：「重新開始」按下去沒反應。
 * 原因：Popconfirm 內包 Tooltip，提示氣泡蓋住確認視窗的「取消／確認」。
 * 這裡確認：按下後出現確認視窗（含說明文字）、畫面上沒有提示氣泡、確認後工作區重置、回到第一步並有成功訊息。
 */
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { App as AntdApp } from 'antd';

Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(() => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() })),
});
class MockResizeObserver { observe(): void {} unobserve(): void {} disconnect(): void {} }
globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

const stableTranslation = vi.hoisted(() => ({
    t: (key: string, fallback?: unknown) => (typeof fallback === 'string' ? fallback : key)
}));
vi.mock('react-i18next', () => ({ useTranslation: () => stableTranslation }));
// 各步驟畫面與本測試無關，換成空殼
vi.mock('../../features/step1_upload/Step1_Upload', () => ({ default: () => <div>step1</div> }));
vi.mock('../../features/step2_mapping/Step2_Mapping', () => ({ default: () => <div>step2</div> }));
vi.mock('../../features/step3_rules/Step3_Rules', () => ({ default: () => <div>step3</div> }));
vi.mock('../../features/step4_result/Step4_Result', () => ({ default: () => <div>step4</div> }));

import MainLayout from '../../features/workspace/MainLayout';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';

const LocationProbe = (): React.ReactElement => {
    const location = useLocation();
    return <div data-testid="location">{location.pathname}{location.search}</div>;
};

const renderLayout = () => render(
    <MemoryRouter initialEntries={['/workspace?step=2']}>
        <AntdApp><MainLayout /><LocationProbe /></AntdApp>
    </MemoryRouter>
);

describe('重新開始（MainLayout）', () => {
    afterEach(() => { cleanup(); useWorkspaceStore.getState().resetWorkspace(); });

    it('Step 1 不顯示重新開始按鈕（尚無進度）', () => {
        useWorkspaceStore.setState({ currentStep: 0 });
        renderLayout();
        expect(screen.queryByTestId('workspace-restart-button')).toBeNull();
    });

    it('按下重新開始：出現確認視窗，沒有會蓋住它的提示氣泡', async () => {
        useWorkspaceStore.setState({ currentStep: 1, dataFile: new File(['a'], 'a.csv') });
        renderLayout();
        fireEvent.click(screen.getByTestId('workspace-restart-button'));
        expect(await screen.findByText('確定要放棄當前進度並重新開始嗎？')).toBeInTheDocument();
        expect(screen.getByText('清空所有資料與設定，回到初始狀態')).toBeInTheDocument();
        expect(document.querySelector('.ant-tooltip')).toBeNull();
    });

    it('確認後：工作區清空、回到第一步，並顯示成功訊息', async () => {
        useWorkspaceStore.setState({ currentStep: 1, dataFile: new File(['a'], 'a.csv') });
        renderLayout();
        fireEvent.click(screen.getByTestId('workspace-restart-button'));
        fireEvent.click(await screen.findByRole('button', { name: /確\s*定/ }));
        await waitFor(() => expect(useWorkspaceStore.getState().currentStep).toBe(0));
        expect(useWorkspaceStore.getState().dataFile).toBeNull();
        expect(screen.getByTestId('location').textContent).toBe('/workspace?step=1');
        expect(await screen.findByText('已清空工作區，回到第一步')).toBeInTheDocument();
    });

    it('取消：什麼都不變', async () => {
        useWorkspaceStore.setState({ currentStep: 1, dataFile: new File(['a'], 'a.csv') });
        renderLayout();
        fireEvent.click(screen.getByTestId('workspace-restart-button'));
        fireEvent.click(await screen.findByRole('button', { name: /取\s*消/ }));
        expect(useWorkspaceStore.getState().currentStep).toBe(1);
        expect(useWorkspaceStore.getState().dataFile).not.toBeNull();
    });
});
