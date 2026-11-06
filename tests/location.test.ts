import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	locationLink,
	normalizeLocation,
	parseLocation,
	requestLocation,
} from '../src/location';

beforeEach(() => {
	vi.useFakeTimers();
	vi.stubGlobal('window', { setTimeout, clearTimeout });
});
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('记录位置', () => {
	it.each(['31.2304, 121.4737', '31.2304，121.4737', 'geo:31.2304,121.4737'])(
		'接受坐标 %s',
		(coordinates) => {
			expect(parseLocation(coordinates, ' 咖啡馆 ')).toEqual({
				latitude: 31.2304,
				longitude: 121.4737,
				name: '咖啡馆',
			});
		},
	);
	it('接受负坐标、零坐标和合法边界', () => {
		expect(parseLocation('-90, +180', '').latitude).toBe(-90);
		expect(parseLocation('-.5, 0', '').longitude).toBe(0);
		expect(parseLocation('0, -180', '').longitude).toBe(-180);
	});
	it.each([
		'',
		'咖啡馆',
		'91, 121',
		'31, -181',
		'NaN, 121',
		'0x10, 12',
		'31 121',
		'31,121,0',
		'geo:31,121?q=test',
	])('拒绝无效坐标 %j', (coordinates) => {
		expect(() => parseLocation(coordinates, '')).toThrow('纬度');
	});
	it.each([
		null,
		{},
		{ latitude: NaN, longitude: 0, name: '' },
		{ latitude: 0, longitude: Infinity, name: '' },
		{ latitude: '31', longitude: 121, name: '' },
	])('拒绝损坏的已存位置 %j', (value) => {
		expect(() => normalizeLocation(value)).toThrow();
	});
	it('保留六位小数并将名称规范为单行', () => {
		expect(
			normalizeLocation({
				latitude: 31.12345678,
				longitude: -0,
				name: ' 咖啡\n馆\u0000 南侧 ',
			}),
		).toEqual({ latitude: 31.123457, longitude: 0, name: '咖啡 馆 南侧' });
	});
	it('生成标准 geo 链接，名称不能插入额外链接或 HTML', () => {
		expect(
			locationLink({
				latitude: 31.2304,
				longitude: 121.4737,
				name: '[店](https://example.com) <b>&',
			}),
		).toBe(
			'[📍 \\[店\\](https://example.com) \\<b\\>&amp;](geo:31.2304,121.4737)',
		);
		expect(locationLink({ latitude: 0, longitude: 0, name: '' })).toBe(
			'[📍 当前位置](geo:0,0)',
		);
	});
});

function setup() {
	const controller = new AbortController();
	const provider = {
		getCurrentPosition: vi.fn<Geolocation['getCurrentPosition']>(),
	};
	const request = requestLocation(provider, controller.signal);
	const [success, failure, options] =
		provider.getCurrentPosition.mock.calls[0]!;
	const position = (latitude = 31.2304, longitude = 121.4737) =>
		({ coords: { latitude, longitude } }) as GeolocationPosition;
	return { controller, request, success, failure: failure!, options, position };
}

describe('设备定位请求', () => {
	it('获取新位置，成功后释放超时与取消监听', async () => {
		const { controller, request, success, options, position } = setup();
		expect(options).toEqual({
			enableHighAccuracy: true,
			maximumAge: 0,
			timeout: 10_000,
		});
		success(position());
		await expect(request).resolves.toEqual({
			latitude: 31.2304,
			longitude: 121.4737,
			name: '',
		});
		controller.abort();
		expect(vi.getTimerCount()).toBe(0);
	});
	it.each([
		[1, '权限被拒绝'],
		[2, '暂时无法'],
		[3, '定位超时'],
	] as const)('为失败代码 %d 提供可操作提示', async (code, message) => {
		const { request, failure } = setup();
		failure({ code } as GeolocationPositionError);
		await expect(request).rejects.toThrow(message);
		expect(vi.getTimerCount()).toBe(0);
	});
	it('系统不返回或权限弹窗悬而未决时也有总超时，忽略迟到的成功回调', async () => {
		const { request, success, position } = setup();
		const rejected = expect(request).rejects.toThrow('定位超时');
		await vi.advanceTimersByTimeAsync(12_000);
		await rejected;
		success(position());
		expect(vi.getTimerCount()).toBe(0);
	});
	it('关闭或手动编辑会取消等待，迟到回调不能附加到下一条记录', async () => {
		const { controller, request, success, failure, position } = setup();
		controller.abort();
		await expect(request).rejects.toMatchObject({ name: 'AbortError' });
		success(position());
		failure({ code: 1 } as GeolocationPositionError);
		expect(vi.getTimerCount()).toBe(0);
	});
	it('不支持的设备和已取消的请求不会开始定位', async () => {
		const controller = new AbortController();
		await expect(requestLocation(undefined, controller.signal)).rejects.toThrow(
			'手动输入',
		);
		controller.abort();
		const provider = { getCurrentPosition: vi.fn() };
		await expect(
			requestLocation(provider, controller.signal),
		).rejects.toMatchObject({ name: 'AbortError' });
		expect(provider.getCurrentPosition).not.toHaveBeenCalled();
	});
	it('拒绝设备返回的损坏坐标', async () => {
		const { request, success, position } = setup();
		success(position(NaN));
		await expect(request).rejects.toThrow('纬度');
		expect(vi.getTimerCount()).toBe(0);
	});
	it('设备 API 同步抛错时也恢复状态', async () => {
		const provider = {
			getCurrentPosition: () => {
				throw new Error('unavailable');
			},
		};
		await expect(
			requestLocation(provider, new AbortController().signal),
		).rejects.toThrow('暂时无法');
	});
});
