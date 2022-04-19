import Big from 'big.js';
import { SupportedChainId, PerpetualProtocol, PositionSide } from '../../../src';

describe("PositionDraft", () => {
  let perp: PerpetualProtocol

  beforeAll(async () => {
    perp = new PerpetualProtocol({
      chainId: SupportedChainId.OPTIMISTIC_ETHEREUM,
      providerConfigs: [
        {
          rpcUrl: "https://mainnet.optimism.io",
        },
      ],
    })
    await perp.init()
  })

  describe("getEntryPrice", () => {
      it("Open positions with 0 input should always get an error", async () => {
          async function expectErrorWhenAmountInputIsZero(side: PositionSide, isAmountInputBase: boolean) {
              try {
                  const tickerSymbol = "ETHUSD"
                  const amountInput = new Big(0)
                  const newPositionDraft = perp.clearingHouse?.createPositionDraft({
                      tickerSymbol,
                      side,
                      amountInput,
                      isAmountInputBase,
                  })
                  await newPositionDraft!.getEntryPrice()
              } catch (e: any) {
                  console.log(e.message)
                  expect(e.message).toEqual("Read Quoter contract error, invoke swap function failed.")
              }
          }
      
          await expectErrorWhenAmountInputIsZero(PositionSide.LONG, false)
          await expectErrorWhenAmountInputIsZero(PositionSide.SHORT, false)
          await expectErrorWhenAmountInputIsZero(PositionSide.LONG, true)
          await expectErrorWhenAmountInputIsZero(PositionSide.SHORT, true)
      })
    
      describe("AmountInput is not zero", () => {
          function expectPositiveEntryPrice(entryPrice: Big) {
              expect(entryPrice.toNumber()).toBeGreaterThanOrEqual(0)
          }
      
          it("Open a long position with quote", async () => {
              const tickerSymbol = "ETHUSD"
              const amountInput = new Big(100)
              const side = PositionSide.LONG
              const isAmountInputBase = false
              const newPositionDraft = perp.clearingHouse?.createPositionDraft({
                  tickerSymbol,
                  side,
                  amountInput,
                  isAmountInputBase,
              })
    
              expectPositiveEntryPrice(await newPositionDraft!.getEntryPrice())
          })
    
          it("Open a short position with quote", async () => {
              const tickerSymbol = "ETHUSD"
              const amountInput = new Big(1)
              const side = PositionSide.SHORT
              const isAmountInputBase = false
              const newPositionDraft = perp.clearingHouse?.createPositionDraft({
                  tickerSymbol,
                  side,
                  amountInput,
                  isAmountInputBase,
              })
    
              expectPositiveEntryPrice(await newPositionDraft!.getEntryPrice())
          })
        
          it("Open a long position with base", async () => {
              const tickerSymbol = "ETHUSD"
              const amountInput = new Big(1)
              const side = PositionSide.LONG
              const isAmountInputBase = true
              const newPositionDraft = perp.clearingHouse?.createPositionDraft({
                  tickerSymbol,
                  side,
                  amountInput,
                  isAmountInputBase,
              })
    
              expectPositiveEntryPrice(await newPositionDraft!.getEntryPrice())
          })
    
          it("Open a short position with base", async () => {
              const tickerSymbol = "ETHUSD"
              const amountInput = new Big(1)
              const side = PositionSide.SHORT
              const isAmountInputBase = true
              const newPositionDraft = perp.clearingHouse?.createPositionDraft({
                  tickerSymbol,
                  side,
                  amountInput,
                  isAmountInputBase,
              })
    
              expectPositiveEntryPrice(await newPositionDraft!.getEntryPrice())
          })
      })
  })
})
