import {Component, OnDestroy, OnInit, ViewChild} from '@angular/core';
import {faCircleNotch, faUserCheck, faInfoCircle} from '@fortawesome/free-solid-svg-icons';
import * as moment from 'moment';
import BigNumber from 'bignumber.js';
import {EChartsOption, graphic} from 'echarts';
import {ActivatedRoute, Router} from '@angular/router';
import {distinctUntilChanged, map, skip} from 'rxjs/operators';
import {combineLatest, Observable, Subscription} from 'rxjs';

import {StatsService} from '../stats.service';
import {ToastService} from '../toast.service';
import {SnippetService} from '../snippet.service';
import Capacity from '../capacity';
import {AccountService} from '../account.service';
import {UpdateNameModalComponent} from '../update-name-modal/update-name-modal.component';
import {UpdateMinimumPayoutModalComponent} from '../update-minimum-payout-modal/update-minimum-payout-modal.component';
import {PoolsProvider} from '../pools.provider';
import {RatesService} from '../rates.service';
import {Payout} from '../farmer-payout-history/farmer-payout-history.component';
import {ConfigService, DateFormatting} from '../config.service';

@Component({
  selector: 'app-my-farmer',
  templateUrl: './my-farmer.component.html',
  styleUrls: ['./my-farmer.component.scss']
})
export class MyFarmerComponent implements OnInit, OnDestroy {
  @ViewChild(UpdateNameModalComponent) updateNameModal;
  @ViewChild(UpdateMinimumPayoutModalComponent) updateMinimumPayoutModal;

  public poolConfig:any = {};
  public singletonGenesisInput = null;
  public faCircleNotch = faCircleNotch;
  public faInfoCircle = faInfoCircle;
  public faUserCheck = faUserCheck;

  public ecChartOptions: EChartsOption;
  public ecChartUpdateOptions: EChartsOption;

  public sharesChartOptions: EChartsOption;
  public sharesChartUpdateOptions: EChartsOption;

  public isLoadingPayoutHistory = true;
  public recentPayouts: Payout[] = [];

  public isAccountLoading: Observable<boolean> = this.accountService.accountSubject
    .asObservable()
    .pipe(
      map(account => !account || !account.payoutAddress),
      distinctUntilChanged()
    );

  private poolEc = 0;
  private dailyRewardPerPib = 0;

  private historicalIntervalInMinutes = 15;

  private subscriptions: Subscription[] = [
    this.activatedRoute.params.subscribe(async params => {
      if (params.singletonGenesis) {
        this.accountService.singletonGenesis = params.singletonGenesis;
        this.accountService.isMyFarmerPage = false;
      } else {
        this.accountService.isMyFarmerPage = true;
        if (this.accountService.singletonGenesis !== this.accountService.singletonGenesisFromLocalStorage) {
          this.accountService.singletonGenesis = this.accountService.singletonGenesisFromLocalStorage;
        }
      }
      await this.initAccount();
    }),
    this.accountService.accountHistoricalStats
      .pipe(skip(1))
      .subscribe(historicalStats => {
        this.ecChartUpdateOptions = this.makeEcChartUpdateOptions(historicalStats);
        this.sharesChartUpdateOptions = this.makeSharesChartUpdateOptions(historicalStats);
      }),
    this.statsService.poolConfig.asObservable().subscribe((poolConfig => this.poolConfig = poolConfig)),
    this.statsService.accountStats.asObservable().subscribe(accountStats => this.poolEc = accountStats.ecSum),
    this.statsService.rewardStats.asObservable().subscribe(rewardStats => this.dailyRewardPerPib = rewardStats.dailyRewardPerPiB),
  ];
  private accountUpdateInterval: number = null;
  private accountHistoricalUpdateInterval: number = null;
  private accountWonBlocksUpdateInterval: number = null;

  constructor(
    public snippetService: SnippetService,
    public accountService: AccountService,
    private statsService: StatsService,
    private toastService: ToastService,
    private poolsProvider: PoolsProvider,
    private activatedRoute: ActivatedRoute,
    private router: Router,
    public ratesService: RatesService,
    private configService: ConfigService,
  ) {
    this.ecChartOptions = {
      title: {
        text: this.snippetService.getSnippet('my-farmer-component.ec-chart.title'),
        left: 'center',
        top: 0,
        textStyle: {
          color: '#cfd0d1'
        }
      },
      grid: {
        left: 65,
        top: 50,
        right: 15,
        bottom: 20,
      },
      tooltip: {
        trigger: 'axis',
        formatter: params => `${moment(params[0].value[0]).format('yyyy-mm-dd HH:mm')}: <strong>${params[0].value[1]} GiB</strong>`,
      },
      xAxis: {
        type: 'time',
        minInterval: this.historicalIntervalInMinutes * 60 * 1000,
      },
      yAxis: {
        type: 'value',
        axisLabel : {
          formatter: '{value} GiB',
        },
        splitLine: {
          lineStyle: {
            type: 'solid',
            color: 'grey',
          },
        },
      },
      series: [{
        data: [],
        type: 'line',
        symbol: 'none',
        smooth: true,
        color: '#4bd28f',
        areaStyle: {
          color: new graphic.LinearGradient(0, 0, 0, 1, [{
            offset: 0,
            color: '#4bd28f',
          }, {
            offset: 1,
            color: '#01bfec',
          }]),
        },
      }],
    };
    this.sharesChartOptions = {
      title: {
        text: this.snippetService.getSnippet('my-farmer-component.shares-chart.title'),
        left: 'center',
        top: 0,
        textStyle: {
          color: '#cfd0d1'
        }
      },
      legend: {
        data: [
          this.snippetService.getSnippet('my-farmer-component.shares-chart.invalid-shares.name'),
          this.snippetService.getSnippet('my-farmer-component.shares-chart.stale-shares.name'),
          this.snippetService.getSnippet('my-farmer-component.shares-chart.valid-shares.name'),
          this.snippetService.getSnippet('my-farmer-component.shares-chart.difficulty.name'),
          this.snippetService.getSnippet('my-farmer-component.shares-chart.partials.name'),
        ],
        top: 20,
        textStyle: {
          color: '#cfd0d1',
        },
      },
      grid: {
        left: 65,
        top: this.shareChartTopMargin,
        right: 40,
        bottom: 20,
      },
      tooltip: {
        trigger: 'axis',
      },
      xAxis: {
        type: 'time',
        minInterval: this.historicalIntervalInMinutes * 60 * 1000,
      },
      yAxis: [{
        type: 'value',
        name: this.snippetService.getSnippet('my-farmer-component.shares-chart.shares.name'),
        splitLine: {
          lineStyle: {
            type: 'solid',
            color: 'grey',
          },
        },
      }, {
        type: 'value',
        name: this.snippetService.getSnippet('my-farmer-component.shares-chart.difficulty.name'),
        splitLine: {
          show: false,
        },
      }],
      series: [{
        data: [],
        type: 'bar',
        stack: 'shares',
        name: this.snippetService.getSnippet('my-farmer-component.shares-chart.invalid-shares.name'),
        color: '#dc3545',
        large: true,
        barWidth: 6,
      }, {
        data: [],
        type: 'bar',
        stack: 'shares',
        name: this.snippetService.getSnippet('my-farmer-component.shares-chart.stale-shares.name'),
        color: '#c98a1a',
        large: true,
        barWidth: 6,
      }, {
        data: [],
        type: 'bar',
        stack: 'shares',
        name: this.snippetService.getSnippet('my-farmer-component.shares-chart.valid-shares.name'),
        color: '#037ffc',
        large: true,
        barWidth: 6,
      }, {
        data: [],
        type: 'line',
        name: this.snippetService.getSnippet('my-farmer-component.shares-chart.difficulty.name'),
        color: '#fac858',
        symbol: 'none',
        smooth: true,
        yAxisIndex: 1,
      }, {
        data: [],
        type: 'line',
        name: this.snippetService.getSnippet('my-farmer-component.shares-chart.partials.name'),
        color: '#46e8eb',
        symbol: 'none',
        yAxisIndex: 1,
        smooth: true,
        lineStyle: {
          type: 'dotted',
        },
      }],
    };
  }

  public ngOnDestroy(): void {
    this.subscriptions.map(subscription => subscription.unsubscribe());
    if (this.accountUpdateInterval) {
      clearInterval(this.accountUpdateInterval);
    }
    if (this.accountHistoricalUpdateInterval) {
      clearInterval(this.accountHistoricalUpdateInterval);
    }
    if (this.accountWonBlocksUpdateInterval) {
      clearInterval(this.accountWonBlocksUpdateInterval);
    }

    if (this.accountService.isMyFarmerPage) {
      return;
    }

    this.accountService.clearStats();
  }

  async ngOnInit() {
    const accountPayoutAddressSource = this.accountService.accountSubject.asObservable()
      .pipe(map(account => {
        if (!account || !account.payoutAddress) {
          return null;
        }

        return account.payoutAddress;
      }), distinctUntilChanged());
    const payoutsSubscription = combineLatest([
      this.statsService.lastPayouts.asObservable(),
      accountPayoutAddressSource,
      this.configService.payoutDateFormattingSubject.asObservable(),
      this.configService.selectedCurrencySubject.asObservable(),
      this.statsService.exchangeStats.asObservable(),
    ])
      .subscribe(([lastPayouts, payoutAddress, payoutDateFormatting]) => {
        if (lastPayouts === null || !payoutAddress) {
          this.isLoadingPayoutHistory = true;

          return;
        }
        this.isLoadingPayoutHistory = false;
        this.recentPayouts = lastPayouts
          .map(payout => {
            const matchingTransaction = payout.transactions.find(tx => tx.payoutAmounts[payoutAddress] !== undefined);
            if (!matchingTransaction) {
              return null;
            }
            const payoutDate = moment(payout.createdAt);
            let payoutAmount = matchingTransaction.payoutAmounts[this.accountService.account.payoutAddress] || null;
            if (payoutAmount) {
              payoutAmount = (new BigNumber(payoutAmount)).decimalPlaces(
                this.statsService.coinConfig.decimalPlaces,
                BigNumber.ROUND_FLOOR
              ).toString();
            }
            let formattedPayoutDate;
            if (payoutDateFormatting === DateFormatting.fixed) {
              formattedPayoutDate = payoutDate.format('YYYY-MM-DD HH:mm');
            } else {
              formattedPayoutDate = payoutDate.fromNow();
            }

            return {
              coinId: matchingTransaction.coinIds[0],
              state: matchingTransaction.state,
              payoutDate: payoutDate.toDate(),
              formattedPayoutDate,
              amount: payoutAmount,
              fiatAmountFormatted: this.ratesService.getValuesInFiatFormatted(parseFloat(payoutAmount) || 0),
              confirmedAtHeight: matchingTransaction.confirmedAtHeight,
            };
          })
          .filter(payout => payout !== null);
      });
    this.subscriptions.push(payoutsSubscription);

    this.accountUpdateInterval = setInterval(async () => {
      if (!this.accountService.haveSingletonGenesis) {
        return;
      }
      await this.accountService.updateAccount();
    }, 3 * 60 * 1000);
    this.accountHistoricalUpdateInterval = setInterval(async () => {
      if (!this.accountService.haveSingletonGenesis) {
        return;
      }
      await this.accountService.updateAccountHistoricalStats();
    }, (this.historicalIntervalInMinutes + 1) * 60 * 1000);
    this.accountWonBlocksUpdateInterval = setInterval(async () => {
      if (!this.accountService.haveSingletonGenesis) {
        return;
      }
      await this.accountService.updateAccountWonBlocks();
    }, 11 * 60 * 1000);

    if (this.isLoginRequest()) {
      await this.loginAndAuthFromQueryParams();
      await this.router.navigate([]);
    }
  }

  private async initAccount() {
    if (!this.accountService.haveSingletonGenesis) {
      return;
    }
    await this.accountService.updateAccount();
    if (!this.accountService.haveAccount) {
      if (!this.accountService.isMyFarmerPage) {
        await new Promise(resolve => setTimeout(resolve, 500));
        await this.router.navigate(['/']);
      }

      return;
    }
    await Promise.all([
      this.accountService.updateAccountHistoricalStats(),
      this.accountService.updateAccountWonBlocks(),
    ]);
  }

  private get shareChartTopMargin(): number {
    if (window.innerWidth >= 716) {
      return 50;
    }
    if (window.innerWidth >= 541) {
      return 70;
    }

    return 94;
  }

  private get minimumPayout() {
    if (this.accountService.account && this.accountService.account.minimumPayout) {
      return this.accountService.account.minimumPayout;
    }
    if (this.poolConfig.minimumPayout) {
      return this.poolConfig.minimumPayout;
    }

    return 0;
  }

  public get pendingProgressRaw(): number {
    if (!this.accountService.account || !this.minimumPayout) {
      return 0;
    }

    return this.accountService.account.pendingBN
      .dividedBy(this.minimumPayout)
      .multipliedBy(100)
      .toNumber();
  }

  public get pendingProgress(): number {
    const progress = this.pendingProgressRaw;

    return Math.min(progress, 100);
  }

  private makeEcChartUpdateOptions(historicalStats): EChartsOption {
    const biggestEc = historicalStats.reduce((acc, curr) => acc > curr.ec ? acc : curr.ec, 0);
    const { unit, unitIndex } = this.getUnitForCapacity(biggestEc);
    const historicalStatsSeries = historicalStats.map(stats => [stats.createdAt, (new BigNumber(stats.ec)).dividedBy((new BigNumber(1024)).exponentiatedBy(unitIndex)).decimalPlaces(2).toNumber()]);
    const lastDate = historicalStats.length > 0 ? historicalStats[0].createdAt : new Date();
    const missingDataLeading = [];
    if (moment(lastDate).isAfter(moment().subtract(23, 'hours'))) {
      let startDate = moment(lastDate).subtract(this.historicalIntervalInMinutes, 'minutes');
      while (startDate.isAfter(moment().subtract(1, 'day'))) {
        missingDataLeading.unshift([startDate.toISOString(), 0]);
        startDate = startDate.subtract(this.historicalIntervalInMinutes, 'minutes');
      }
    }
    const latestDate = historicalStats.length > 0 ? historicalStats[historicalStats.length - 1].createdAt : new Date();
    const missingDataTrailing = [];
    if (moment(latestDate).isBefore(moment().subtract(1, 'hours'))) {
      let endDate = moment(latestDate).add(this.historicalIntervalInMinutes, 'minutes');
      while (endDate.isBefore(moment())) {
        missingDataTrailing.push([endDate.toISOString(), 0]);
        endDate = endDate.add(this.historicalIntervalInMinutes, 'minutes');
      }
    }

    return {
      tooltip: {
        formatter: params => `${moment(params[0].value[0]).format('YYYY-MM-DD HH:mm')}<br/> <strong>${params[0].value[1]} ${unit}</strong>`,
      },
      yAxis: {
        axisLabel: {
          formatter: `{value} ${unit}`,
        },
      },
      series: [{
        data: missingDataLeading.concat(historicalStatsSeries, missingDataTrailing),
      }],
    };
  }

  private makeSharesChartUpdateOptions(historicalStats): EChartsOption {
    const historicalSharesSeries = historicalStats.map(stats => [stats.createdAt, stats.shares]);
    const historicalStaleSharesSeries = historicalStats.map(stats => [stats.createdAt, stats.staleShares || 0]);
    const historicalInvalidSharesSeries = historicalStats.map(stats => [stats.createdAt, stats.invalidShares || 0]);
    const historicalShareCountSeries = historicalStats.map(stats => [stats.createdAt, stats.shareCount]);
    const historicalDifficultySeries = historicalStats.map(stats => [stats.createdAt, stats.difficulty]);
    const lastDate = historicalStats.length > 0 ? historicalStats[0].createdAt : new Date();
    const missingSharesDataLeading = [];
    const missingShareCountDataLeading = [];
    const missingDifficultyDataLeading = [];
    if (moment(lastDate).isAfter(moment().subtract(23, 'hours'))) {
      let startDate = moment(lastDate).subtract(this.historicalIntervalInMinutes, 'minutes');
      while (startDate.isAfter(moment().subtract(1, 'day'))) {
        missingSharesDataLeading.unshift([startDate.toISOString(), 0]);
        missingShareCountDataLeading.unshift([startDate.toISOString(), 0]);
        missingDifficultyDataLeading.unshift([startDate.toISOString(), 1]);
        startDate = startDate.subtract(this.historicalIntervalInMinutes, 'minutes');
      }
    }
    const latestDate = historicalStats.length > 0 ? historicalStats[historicalStats.length - 1].createdAt : new Date();
    const missingSharesDataTrailing = [];
    const missingShareCountDataTrailing = [];
    const missingDifficultyDataTrailing = [];
    if (moment(latestDate).isBefore(moment().subtract(1, 'hours'))) {
      let endDate = moment(latestDate).add(this.historicalIntervalInMinutes, 'minutes');
      while (endDate.isBefore(moment())) {
        missingSharesDataTrailing.push([endDate.toISOString(), 0]);
        missingShareCountDataTrailing.push([endDate.toISOString(), 0]);
        missingDifficultyDataTrailing.push([endDate.toISOString(), 1]);
        endDate = endDate.add(this.historicalIntervalInMinutes, 'minutes');
      }
    }

    return {
      series: [{
        data: missingSharesDataLeading.concat(historicalInvalidSharesSeries, missingSharesDataTrailing),
      }, {
        data: missingSharesDataLeading.concat(historicalStaleSharesSeries, missingSharesDataTrailing),
      }, {
        data: missingSharesDataLeading.concat(historicalSharesSeries, missingSharesDataTrailing),
      }, {
        data: missingDifficultyDataLeading.concat(historicalDifficultySeries, missingDifficultyDataTrailing),
      }, {
        data: missingShareCountDataLeading.concat(historicalShareCountSeries, missingShareCountDataTrailing),
      }],
    };
  }

  private getUnitForCapacity(capacityInGib) {
    let unitIndex = 0;
    const units = ['GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
    while (capacityInGib >= 1024) {
      capacityInGib /= 1024;
      unitIndex += 1;
    }

    return {
      unitIndex,
      unit: units[unitIndex],
    };
  }

  async loginAndAuthFromQueryParams() {
    const singletonGenesis = this.activatedRoute.snapshot.queryParamMap.get('launcher_id');
    const message = this.activatedRoute.snapshot.queryParamMap.get('authentication_token');
    const signature = this.activatedRoute.snapshot.queryParamMap.get('signature');
    const success: boolean = await this.accountService.login({ singletonGenesis });
    if (!success) {
      return;
    }
    try {
      await this.accountService.authenticate({ message, signature });
      this.toastService.showSuccessToast(this.snippetService.getSnippet('authentication-modal.success'));
    } catch (err) {
      this.toastService.showErrorToast(err.message);
      return;
    }
  }

  isLoginRequest() {
    const singletonGenesis = this.activatedRoute.snapshot.queryParamMap.get('launcher_id');
    const message = this.activatedRoute.snapshot.queryParamMap.get('authentication_token');
    const signature = this.activatedRoute.snapshot.queryParamMap.get('signature');

    return singletonGenesis && message && signature;
  }

  async login() {
    if (!this.singletonGenesisInput) {
      this.toastService.showErrorToast(this.snippetService.getSnippet('my-farmer-component.singleton-genesis-input.error.missing'));
      return;
    }
    const success: boolean = await this.accountService.login({ singletonGenesis: this.singletonGenesisInput });
    if (!success) {
      return;
    }
    this.singletonGenesisInput = null;
  }

  getFormattedCapacity(capacityInGiB) {
    if (capacityInGiB === 0) {
      return this.snippetService.getSnippet('general.not-available.short');
    }

    return (new Capacity(capacityInGiB)).toString();
  }

  getLastAcceptedPartialAtDuration(lastAcceptedPartialAt) {
    if (!lastAcceptedPartialAt) {
      return 'Never';
    }

    return moment(lastAcceptedPartialAt).fromNow();
  }

  get ecShare() {
    if (!this.accountService.account || !this.poolEc) {
      return 0;
    }

    return ((this.accountService.account.ec / this.poolEc) * 100).toFixed(2);
  }

  get estimatedDailyReward() {
    if (!this.accountService.account || !this.dailyRewardPerPib) {
      return 0;
    }
    const ecInPib = (new BigNumber(this.accountService.account.ec)).dividedBy((new BigNumber(1024).exponentiatedBy(2)));

    return ecInPib.multipliedBy(this.dailyRewardPerPib).toFixed(4);
  }

  async updateName() {
    this.updateNameModal.openModal();
  }

  async updateMinimumPayout() {
    this.updateMinimumPayoutModal.openModal();
  }

  get authDocsUrl() {
    return `https://docs.foxypool.io/proof-of-spacetime/foxy-pool/pools/${this.poolsProvider.poolIdentifier}/authenticate/`;
  }

  getBlockExplorerAddressLink(address) {
    if (!this.poolConfig || !this.poolConfig.blockExplorerAddressUrlTemplate) {
      return '';
    }

    return this.poolConfig.blockExplorerAddressUrlTemplate.replace('#ADDRESS#', address);
  }
}
