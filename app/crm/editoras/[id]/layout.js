import PublisherMaterialsMount from '@/components/PublisherMaterialsMount';
import PublisherRadarDetailMount from '@/components/PublisherRadarDetailMount';

export default function PublisherDetailLayout({children}){
  return <>{children}<PublisherMaterialsMount/><PublisherRadarDetailMount/></>;
}
