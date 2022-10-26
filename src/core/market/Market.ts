import { Big } from "big.js"

import {
    Channel,
    ChannelEventSource,
    DEFAULT_PERIOD,
    MemoizedFetcher,
    createMemoizedFetcher,
    hasNumbersChange,
} from "../../internal"
import {
    TickPriceMode,
    fromSqrtX96,
    getMaxTickByTickSpacing,
    getMinTickByTickSpacing,
    getTickFromPrice,
    poll,
    tickToPrice,
} from "../../utils"
import { ContractReader, GetMarketStatusReturn } from "../contractReader"
import type { PerpetualProtocol } from "../PerpetualProtocol"

type MarketEventName = "updateError" | "updated"

type CacheKey = "indexPrice" | "markPrice" | "indexTwapPrice" | "isMarketPaused" | "isMarketClosed" | "marketStatus"

type CacheValue = Big | boolean | GetMarketStatusReturn

export enum MarketStatus {
    ACTIVE = "ACTIVE",
    PAUSED = "PAUSED",
    CLOSED = "CLOSED",
}

class Market extends Channel<MarketEventName> {
    private _cache: Map<CacheKey, CacheValue> = new Map()
    private readonly _contractReader: ContractReader

    constructor(
        private readonly _perp: PerpetualProtocol,
        readonly tickerSymbol: string,
        readonly poolAddress: string,
        readonly baseSymbol: string,
        readonly baseAddress: string,
        readonly quoteSymbol: string,
        readonly quoteAddress: string,
    ) {
        super(_perp.channelRegistry)
        this._perp = _perp
        this.poolAddress = poolAddress
        this.baseAddress = baseAddress
        this.quoteAddress = quoteAddress
        this._contractReader = this._perp.contractReader
    }

    get tickSpacing() {
        return this._perp.clearingHouseConfig.marketTickSpacings[this.poolAddress]
    }

    get maxTick() {
        return getMaxTickByTickSpacing(this.tickSpacing)
    }

    get minTick() {
        return getMinTickByTickSpacing(this.tickSpacing)
    }

    getTickFromPrice(price: Big, mode?: TickPriceMode) {
        return getTickFromPrice(price, this.tickSpacing, mode)
    }

    getPriceFromTick(tick: number) {
        return tickToPrice(tick)
    }

    getPriceFeedAggregator() {
        return this._contractReader.getPriceFeedAggregator(this.baseAddress)
    }

    protected _getEventSourceMap() {
        const fetchAndEmitUpdated = this._createFetchUpdateData()
        const updateDataEventSource = new ChannelEventSource<MarketEventName>({
            eventSourceStarter: () => {
                const { cancel } = poll(fetchAndEmitUpdated, this._perp.moduleConfigs?.market?.period || DEFAULT_PERIOD)
                return cancel
            },
            initEventEmitter: () => fetchAndEmitUpdated(true, true),
        })

        // TODO: eventName typing protection, should error when invalid eventName is provided
        return {
            updated: updateDataEventSource,
            updateError: updateDataEventSource,
        }
    }

    /**
     * Get market data and emit "updated" event
     */
    private _createFetchUpdateData(): MemoizedFetcher {
        const getMarketData = async () => {
            try {
                const result = await this._contractReader.getMarketData({
                    poolAddress: this.poolAddress,
                    baseAddress: this.baseAddress,
                    twapTimeRange: 15 * 60,
                })

                const { markPrice, indexPrice, indexTwapPrice } = result

                this._cache.set("markPrice", markPrice)
                this._cache.set("indexPrice", indexPrice)
                this._cache.set("indexTwapPrice", indexTwapPrice)

                return result
            } catch (error) {
                this.emit("updateError", { error })
            }
        }

        return createMemoizedFetcher(
            getMarketData.bind(this),
            () => {
                this.emit("updated", this)
            },
            (a, b) => (a && b ? hasNumbersChange(a, b) : true),
        )
    }

    async getStatus() {
        const { isPaused, isClosed } = await this._fetch("marketStatus", { cache: false })
        return isClosed ? MarketStatus.CLOSED : isPaused ? MarketStatus.PAUSED : MarketStatus.ACTIVE
    }

    async getPrices({ cache = true } = {}) {
        console.log("debug getPrices")
        // TODO: replace with multi-call
        const [markPrice, indexPrice, indexTwapPrice] = await Promise.all([
            this._fetch("markPrice", { cache }),
            this._fetch("indexPrice", { cache }),
            this._fetch("indexTwapPrice", { cache }),
        ])
        return {
            markPrice,
            indexPrice,
            indexTwapPrice,
        }
    }

    private async _fetch(key: "indexPrice" | "markPrice" | "indexTwapPrice", obj?: { cache: boolean }): Promise<Big>
    private async _fetch(key: "isMarketPaused" | "isMarketClosed", obj?: { cache: boolean }): Promise<boolean>
    private async _fetch(key: "marketStatus", obj?: { cache: boolean }): Promise<GetMarketStatusReturn>
    private async _fetch(key: CacheKey, obj?: { cache: boolean }): Promise<CacheValue>
    private async _fetch(key: CacheKey, { cache = true } = {}) {
        if (this._cache.has(key) && cache) {
            return this._cache.get(key)
        }

        let result
        switch (key) {
            case "indexPrice": {
                result = await this._contractReader.getIndexPrice(this.baseAddress)
                break
            }
            case "markPrice": {
                const { sqrtPriceX96 } = await this._contractReader.getSlot0(this.poolAddress)
                result = fromSqrtX96(sqrtPriceX96)
                break
            }
            case "indexTwapPrice": {
                result = await this._contractReader.getIndexPrice(this.baseAddress, 15 * 60)
                break
            }
            case "isMarketPaused": {
                result = await this._contractReader.isMarketPaused(this.baseAddress)
                break
            }
            case "isMarketClosed": {
                result = await this._contractReader.isMarketClosed(this.baseAddress)
                break
            }
            case "marketStatus": {
                result = await this._contractReader.getMarketStatus(this.baseAddress)
                break
            }
        }
        this._cache.set(key, result)

        return result
    }
}

export { Market }
