import { Link } from 'react-router-dom';
import { entryPath } from '../../runtime';

const NotFound = () => {
  return (
    <>
      <main className="p-8"><h1>页面不存在</h1><Link to={entryPath()}>返回设备列表</Link></main>
    </>
  );
};

export default NotFound;
